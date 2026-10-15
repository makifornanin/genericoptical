import { and, asc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { resolvePermissions, type Role } from "@/lib/permissions";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { randomToken, sha256 } from "@/server/auth/tokens";
import { businesses, businessMemberships, loginAttempts, passwordResetTokens, sessions, users } from "@/server/db/schema";
import { AppError, audit, db, invalid, type Ctx } from "./core";

export const SESSION_DAYS = 14;
const MAX_FAILED_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;

type Meta = { ip?: string | null; userAgent?: string | null };

export async function authenticate(emailInput: string, password: string, meta: Meta = {}) {
  const email = emailInput.trim().toLowerCase();
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000);
  const [{ failures }] = await db()
    .select({ failures: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(sql`lower(${loginAttempts.email}) = ${email}`, eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  if (failures >= MAX_FAILED_ATTEMPTS) {
    throw new AppError(`Too many failed sign-in attempts. Try again in ${ATTEMPT_WINDOW_MINUTES} minutes or reset your password.`, "unauthorized");
  }

  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  // Always run a hash comparison so response time doesn't reveal whether the account exists.
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH);
  const membership = user && ok && user.isActive ? await firstActiveMembership(user.id) : null;

  await db().insert(loginAttempts).values({ email, ip: meta.ip ?? null, succeeded: Boolean(membership) });
  if (!user || !ok || !user.isActive) throw new AppError("That email and password don't match an active account.", "unauthorized");
  if (!membership) throw new AppError("Your account isn't linked to an active business. Ask the owner to restore your access.", "unauthorized");

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().insert(sessions).values({
    id: sha256(token),
    userId: user.id,
    businessId: membership.businessId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { token, expiresAt, businessId: membership.businessId };
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

async function firstActiveMembership(userId: string) {
  const [m] = await db()
    .select({ businessId: businessMemberships.businessId })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.isActive, true)))
    .orderBy(asc(businessMemberships.createdAt))
    .limit(1);
  return m ?? null;
}

export type SessionInfo = {
  sessionId: string;
  user: { id: string; name: string; email: string };
  membership: typeof businessMemberships.$inferSelect;
  business: typeof businesses.$inferSelect;
  ctx: Ctx;
};

/** Resolves a raw session token to the acting user, business and permissions, or null. */
export async function resolveSession(token: string | undefined | null, meta: Meta = {}): Promise<SessionInfo | null> {
  if (!token || token.length > 200) return null;
  const sessionId = sha256(token);
  const [row] = await db()
    .select({ session: sessions, user: users, membership: businessMemberships, business: businesses })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(
      businessMemberships,
      and(eq(businessMemberships.userId, sessions.userId), eq(businessMemberships.businessId, sessions.businessId)),
    )
    .innerJoin(businesses, eq(businesses.id, sessions.businessId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now() || !row.user.isActive || !row.membership.isActive) {
    await db().delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  if (Date.now() - row.session.lastSeenAt.getTime() > 15 * 60_000) {
    await db().update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
  }
  const role = row.membership.role as Role;
  return {
    sessionId,
    user: { id: row.user.id, name: row.user.name, email: row.user.email },
    membership: row.membership,
    business: row.business,
    ctx: {
      userId: row.user.id,
      membershipId: row.membership.id,
      businessId: row.business.id,
      role,
      permissions: resolvePermissions(role, row.membership.permissionOverrides),
      actorLabel: row.user.name,
      branchId: row.membership.defaultBranchId,
      ip: meta.ip ?? null,
    },
  };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await db().delete(sessions).where(eq(sessions.id, sha256(token)));
}

/** Creates a reset token. Returns null (silently) for unknown emails so the response can't be used to probe accounts. */
export async function createPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user || !user.isActive) return null;
  const token = randomToken();
  await db()
    .insert(passwordResetTokens)
    .values({ id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000) });
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

export async function resetPassword(token: string, newPassword: string) {
  const problem = passwordProblem(newPassword);
  if (problem) throw invalid(problem, { password: [problem] });
  const id = sha256(token);
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .for("update")
      .limit(1);
    if (!row) throw invalid("This reset link has expired or was already used. Request a new one.");
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
    await tx.update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(users.id, row.userId));
    // Sign out everywhere after a reset.
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    return { userId: row.userId };
  });
}

/** Changes the signed-in user's password and signs out their other sessions (the current one is kept). */
export async function changePassword(ctx: Ctx, current: string, next: string, keepSessionId?: string) {
  if (!ctx.userId) throw invalid("Not signed in.");
  const problem = passwordProblem(next);
  if (problem) throw invalid(problem, { newPassword: [problem] });
  const [user] = await db().select().from(users).where(eq(users.id, ctx.userId)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    throw invalid("Your current password is incorrect.", { currentPassword: ["Incorrect password."] });
  }
  await db().update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, user.id));
  await db()
    .delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, user.id), ne(sessions.id, keepSessionId)) : eq(sessions.userId, user.id));
  await audit(db(), ctx, { action: "user.password_changed", entityType: "user", entityId: null, summary: `${user.name} changed their password and signed out other devices` });
}
