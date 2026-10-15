import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PERMISSIONS, resolvePermissions, ROLE_LABELS, ROLES, type Permission, type Role } from "@/lib/permissions";
import { optPhone, optText, reqText, optUuid } from "@/lib/schemas";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { getDb } from "@/server/db";
import type { Executor } from "@/server/db";
import { auditLogs, branches, businesses, businessMemberships, loginAttempts, sessions, users } from "@/server/db/schema";
import { audit, conflict, db, forbidden, invalid, likePattern, mapDbError, notFound, now, pageOf, paging, requirePermission, type Ctx, ref } from "./core";

export const staffInput = z.object({
  name: reqText("Name", 120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(ROLES),
  title: optText(80),
  phone: optPhone,
  defaultBranchId: optUuid,
  takesAppointments: z.boolean().default(false),
  calendarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  grant: z.array(z.string()).default([]),
  revoke: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export async function listStaff(ctx: Ctx) {
  requirePermission(ctx, "staff.view");
  const rows = await db()
    .select({
      membership: businessMemberships,
      name: users.name,
      email: users.email,
      lastLoginAt: users.lastLoginAt,
      branchName: branches.name,
      salesCents: sql<number>`(select coalesce(sum(s.total_cents - s.refunded_cents), 0)::bigint from sales s where s.sold_by_membership_id = ${ref(businessMemberships.id)} and s.status = 'completed' and s.completed_at >= now() - interval '30 days')`,
      salesCount: sql<number>`(select count(*)::int from sales s where s.sold_by_membership_id = ${ref(businessMemberships.id)} and s.status = 'completed' and s.completed_at >= now() - interval '30 days')`,
    })
    .from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .leftJoin(branches, eq(branches.id, businessMemberships.defaultBranchId))
    .where(eq(businessMemberships.businessId, ctx.businessId))
    .orderBy(desc(businessMemberships.isActive), asc(users.name));
  return rows.map((r) => ({ ...r, salesCents: Number(r.salesCents), salesCount: Number(r.salesCount) }));
}

function cleanOverrides(role: Role, grant: string[], revoke: string[]) {
  const valid = (p: string) => p in PERMISSIONS && p !== "demo.reset";
  if (role === "owner") return {};
  return { grant: [...new Set(grant.filter(valid))], revoke: [...new Set(revoke.filter(valid))] };
}

/** Permissions only an owner may hand out, because they control staff, settings and integrations. */
const OWNER_ONLY_GRANTS: Permission[] = ["staff.manage", "settings.manage", "integrations.manage"];

/**
 * Non-owners with staff.manage may only give access they hold themselves, may not hand out the
 * owner-only permissions, and may not change their own access (no self-escalation).
 */
function assertCanAssign(ctx: Ctx, role: Role, overrides: { grant?: string[]; revoke?: string[] }, targetMembershipId: string | null) {
  if (ctx.role === "owner") return;
  if (targetMembershipId && targetMembershipId === ctx.membershipId) throw forbidden("Ask an owner to change your own role or permissions.");
  const effective = resolvePermissions(role, overrides);
  const missing = [...effective].filter((p) => !ctx.permissions.has(p));
  if (missing.length) throw forbidden(`You can't give access you don't have yourself (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}).`);
  const ownerOnly = (overrides.grant ?? []).filter((p) => OWNER_ONLY_GRANTS.includes(p as Permission));
  if (ownerOnly.length) throw forbidden(`Only an owner can grant ${ownerOnly.join(", ")}.`);
}

/**
 * A person can belong to more than one business on the same installation (users are global). Their
 * sign-in details must then only be changed by themselves — never by staff admins of one business.
 */
async function hasOtherBusinesses(ex: Executor, userId: string, businessId: string) {
  const [row] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.userId, userId), sql`${businessMemberships.businessId} <> ${businessId}`));
  return Number(row?.n ?? 0) > 0;
}

async function isDemoBusiness(ex: Executor, businessId: string) {
  if (process.env.DEMO_MODE !== "true") return false;
  const [b] = await ex.select({ isDemo: businesses.isDemo }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return Boolean(b?.isDemo);
}

/** Locks the business's active owner rows and returns how many there are (serialises "last owner" checks). */
async function lockOwners(ex: Executor, businessId: string) {
  const rows = await ex
    .select({ id: businessMemberships.id })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.isActive, true)))
    .for("update");
  return rows.length;
}

/** Adds a staff member with a temporary password (shared with them out of band). */
export async function createStaff(ctx: Ctx, raw: unknown, temporaryPassword: string) {
  requirePermission(ctx, "staff.manage");
  const input = staffInput.parse(raw);
  if (input.role === "owner" && ctx.role !== "owner") throw forbidden("Only owners can add another owner.");
  assertCanAssign(ctx, input.role, { grant: input.grant, revoke: input.revoke }, null);
  const problem = passwordProblem(temporaryPassword);
  if (problem) throw invalid(problem, { password: [problem] });
  try {
    return await getDb().transaction(async (tx) => {
      if (input.defaultBranchId) {
        const [b] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, input.defaultBranchId))).limit(1);
        if (!b) throw invalid("Unknown branch.");
      }
      const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
      if (existing) {
        const [here] = await tx
          .select({ id: businessMemberships.id })
          .from(businessMemberships)
          .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.userId, existing.id)))
          .limit(1);
        // Never attach (or later reset) an account that someone else controls.
        throw conflict(
          here
            ? "This person is already on your staff list — edit or reactivate them instead."
            : "That email already belongs to an existing account. Use a different email address for this staff member.",
        );
      }
      const [user] = await tx.insert(users).values({ email: input.email, name: input.name, passwordHash: await hashPassword(temporaryPassword) }).returning();
      const [m] = await tx
        .insert(businessMemberships)
        .values({
          businessId: ctx.businessId,
          userId: user.id,
          role: input.role,
          title: input.title,
          phone: input.phone,
          defaultBranchId: input.defaultBranchId,
          takesAppointments: input.takesAppointments,
          calendarColor: input.calendarColor ?? null,
          permissionOverrides: cleanOverrides(input.role, input.grant, input.revoke),
          isActive: true,
        })
        .returning();
      await audit(tx, ctx, { action: "staff.created", entityType: "membership", entityId: m.id, summary: `Added ${input.name} as ${ROLE_LABELS[input.role]}` });
      return m;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function updateStaff(ctx: Ctx, membershipId: string, raw: unknown) {
  requirePermission(ctx, "staff.manage");
  const input = staffInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const [m] = await tx
        .select({ membership: businessMemberships, user: users })
        .from(businessMemberships)
        .innerJoin(users, eq(users.id, businessMemberships.userId))
        .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, membershipId)))
        .for("update");
      if (!m) throw notFound("Staff member");
      const changingOwner = m.membership.role === "owner" || input.role === "owner";
      if (changingOwner && ctx.role !== "owner") throw forbidden("Only owners can change an owner's access.");
      const accessChanged =
        input.role !== m.membership.role || JSON.stringify(cleanOverrides(input.role, input.grant, input.revoke)) !== JSON.stringify(m.membership.permissionOverrides ?? {});
      if (accessChanged) assertCanAssign(ctx, input.role, { grant: input.grant, revoke: input.revoke }, membershipId);
      if (m.membership.role === "owner" && (input.role !== "owner" || !input.isActive)) {
        if ((await lockOwners(tx, ctx.businessId)) <= 1) throw invalid("A business needs at least one active owner.");
      }
      if (membershipId === ctx.membershipId && !input.isActive) throw invalid("You can't deactivate your own account.");
      const identityChanged = input.email !== m.user.email.toLowerCase() || input.name !== m.user.name;
      if (identityChanged) {
        if (await hasOtherBusinesses(tx, m.user.id, ctx.businessId)) {
          throw forbidden("This person's sign-in account is also used by another business, so only they can change its name or email.");
        }
        if (input.email !== m.user.email.toLowerCase() && (await isDemoBusiness(tx, ctx.businessId))) throw forbidden("Demo account emails can't be changed.");
        if (input.email !== m.user.email.toLowerCase()) {
          const [clash] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
          if (clash && clash.id !== m.user.id) throw invalid("Another account already uses this email.");
        }
        await tx.update(users).set({ name: input.name, email: input.email, updatedAt: now(ctx) }).where(eq(users.id, m.user.id));
      }
      await tx
        .update(businessMemberships)
        .set({
          role: input.role,
          title: input.title,
          phone: input.phone,
          defaultBranchId: input.defaultBranchId,
          takesAppointments: input.takesAppointments,
          calendarColor: input.calendarColor ?? null,
          permissionOverrides: cleanOverrides(input.role, input.grant, input.revoke),
          isActive: input.isActive,
          updatedAt: now(ctx),
        })
        .where(eq(businessMemberships.id, membershipId));
      // Deactivated staff are signed out immediately.
      if (!input.isActive) await tx.delete(sessions).where(and(eq(sessions.userId, m.user.id), eq(sessions.businessId, ctx.businessId)));
      await audit(tx, ctx, {
        action: "staff.updated",
        entityType: "membership",
        entityId: membershipId,
        summary: `Updated ${input.name}: ${ROLE_LABELS[input.role]}${input.isActive ? "" : " (deactivated)"}`,
      });
      return { membershipId };
    });
  } catch (error) {
    mapDbError(error);
  }
}

/** Account recovery handled by an owner/manager when email delivery isn't configured. */
export async function setTemporaryPassword(ctx: Ctx, membershipId: string, password: string) {
  requirePermission(ctx, "staff.manage");
  const problem = passwordProblem(password);
  if (problem) throw invalid(problem, { password: [problem] });
  const [m] = await db()
    .select({ userId: businessMemberships.userId, role: businessMemberships.role, name: users.name })
    .from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, membershipId)))
    .limit(1);
  if (!m) throw notFound("Staff member");
  if (m.role === "owner" && ctx.role !== "owner") throw forbidden("Only owners can reset an owner's password.");
  if (membershipId === ctx.membershipId) throw invalid("Change your own password from Account instead.");
  if (await hasOtherBusinesses(db(), m.userId, ctx.businessId)) {
    throw forbidden("This person's sign-in account is also used by another business, so only they can reset its password.");
  }
  if (await isDemoBusiness(db(), ctx.businessId)) throw forbidden("Demo account passwords can't be changed.");
  const [u] = await db().update(users).set({ passwordHash: await hashPassword(password), updatedAt: now(ctx) }).where(eq(users.id, m.userId)).returning({ email: users.email });
  await db().delete(sessions).where(eq(sessions.userId, m.userId));
  // A fresh password also lifts any sign-in lockout from earlier failed attempts.
  await db().delete(loginAttempts).where(and(sql`lower(${loginAttempts.email}) = ${u.email.toLowerCase()}`, eq(loginAttempts.succeeded, false)));
  await audit(db(), ctx, { action: "staff.password_reset", entityType: "membership", entityId: membershipId, summary: `Set a temporary password for ${m.name}` });
}

// ─── Activity log ────────────────────────────────────────────────────────────

export async function listActivity(ctx: Ctx, f: { q?: string; entityType?: string | null; actor?: string | null; from?: Date; to?: Date; page?: number; pageSize?: number }) {
  requirePermission(ctx, "audit.view");
  const { page, pageSize, offset } = paging({ ...f, pageSize: f.pageSize ?? 50 });
  const conds: SQL[] = [eq(auditLogs.businessId, ctx.businessId)];
  if (f.entityType) conds.push(eq(auditLogs.entityType, f.entityType));
  if (f.actor) conds.push(eq(auditLogs.actorMembershipId, f.actor));
  if (f.from) conds.push(sql`${auditLogs.createdAt} >= ${f.from}`);
  if (f.to) conds.push(sql`${auditLogs.createdAt} < ${f.to}`);
  if (f.q) conds.push(sql`(${auditLogs.summary} ilike ${likePattern(f.q)} or ${auditLogs.action} ilike ${likePattern(f.q)} or ${auditLogs.actorLabel} ilike ${likePattern(f.q)})`);
  const where = and(...conds);
  const rows = await db().select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset);
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

export async function recentActivity(ctx: Ctx, limit = 8) {
  return db().select().from(auditLogs).where(eq(auditLogs.businessId, ctx.businessId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

