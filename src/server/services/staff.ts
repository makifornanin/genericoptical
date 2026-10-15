import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PERMISSIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";
import { optPhone, optText, reqText, optUuid } from "@/lib/schemas";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { auditLogs, branches, businessMemberships, sessions, users } from "@/server/db/schema";
import { audit, db, forbidden, invalid, likePattern, mapDbError, notFound, now, pageOf, paging, requirePermission, type Ctx, ref } from "./core";

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

/** Adds a staff member with a temporary password (shared with them out of band). */
export async function createStaff(ctx: Ctx, raw: unknown, temporaryPassword: string) {
  requirePermission(ctx, "staff.manage");
  const input = staffInput.parse(raw);
  if (input.role === "owner" && ctx.role !== "owner") throw forbidden("Only owners can add another owner.");
  const problem = passwordProblem(temporaryPassword);
  if (problem) throw invalid(problem, { password: [problem] });
  try {
    return await getDb().transaction(async (tx) => {
      if (input.defaultBranchId) {
        const [b] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, input.defaultBranchId))).limit(1);
        if (!b) throw invalid("Unknown branch.");
      }
      let [user] = await tx.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
      if (!user) {
        [user] = await tx.insert(users).values({ email: input.email, name: input.name, passwordHash: await hashPassword(temporaryPassword) }).returning();
      }
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
      if (m.membership.role === "owner" && (input.role !== "owner" || !input.isActive)) {
        const [{ owners }] = await tx
          .select({ owners: sql<number>`count(*)::int` })
          .from(businessMemberships)
          .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.isActive, true)));
        if (Number(owners) <= 1) throw invalid("A business needs at least one active owner.");
      }
      if (membershipId === ctx.membershipId && !input.isActive) throw invalid("You can't deactivate your own account.");
      if (input.email !== m.user.email.toLowerCase()) {
        const [clash] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
        if (clash && clash.id !== m.user.id) throw invalid("Another account already uses this email.");
      }
      await tx.update(users).set({ name: input.name, email: input.email, updatedAt: now(ctx) }).where(eq(users.id, m.user.id));
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
  await db().update(users).set({ passwordHash: await hashPassword(password), updatedAt: now(ctx) }).where(eq(users.id, m.userId));
  await db().delete(sessions).where(eq(sessions.userId, m.userId));
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

