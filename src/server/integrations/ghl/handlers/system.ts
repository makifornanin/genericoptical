import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { businessMemberships, ghlCalendars, ghlPipelines, ghlUsers, integrationConnections, users } from "@/server/db/schema";
import { apiFor } from "../connection";
import type { Handler } from "../engine";
import { GhlPermissionError } from "../errors";

/**
 * system.refresh_metadata — refreshes the sub-account name/time zone, pipelines, calendars and users
 * used by the mapping screens. Users are auto-linked to staff by exact email; calendars are mapped by a
 * person (a guess could book patients into the wrong branch).
 */
export const refreshMetadata: Handler = async (_event, env) => {
  const businessId = env.businessId;
  const { api, connection } = await apiFor(businessId);
  const out: Record<string, unknown> = {};
  const notes: string[] = [];

  const { location } = await api.getLocation();
  await getDb()
    .update(integrationConnections)
    .set({ accountName: location?.name ?? connection.accountName, accountTimezone: location?.timezone ?? connection.accountTimezone, companyId: connection.companyId ?? location?.companyId ?? null, updatedAt: new Date() })
    .where(eq(integrationConnections.id, connection.id));

  const guarded = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof GhlPermissionError) notes.push(`${label}: missing scope`);
      else throw error;
    }
  };

  await guarded("pipelines", async () => {
    const { pipelines } = await api.listPipelines();
    for (const p of pipelines ?? []) {
      const stages = (p.stages ?? []).map((s, i) => ({ id: s.id, name: s.name, position: s.position ?? i }));
      await getDb()
        .insert(ghlPipelines)
        .values({ businessId, ghlPipelineId: p.id, name: p.name, stages, fetchedAt: new Date() })
        .onConflictDoUpdate({ target: [ghlPipelines.businessId, ghlPipelines.ghlPipelineId], set: { name: p.name, stages, fetchedAt: new Date() } });
    }
    out.pipelines = pipelines?.length ?? 0;
  });

  await guarded("calendars", async () => {
    const { calendars } = await api.listCalendars();
    for (const c of calendars ?? []) {
      await getDb()
        .insert(ghlCalendars)
        .values({ businessId, ghlCalendarId: c.id, name: c.name, isActive: c.isActive !== false, fetchedAt: new Date() })
        .onConflictDoUpdate({ target: [ghlCalendars.businessId, ghlCalendars.ghlCalendarId], set: { name: c.name, isActive: c.isActive !== false, fetchedAt: new Date() } });
    }
    out.calendars = calendars?.length ?? 0;
  });

  const companyId = connection.companyId ?? location?.companyId;
  if (companyId) {
    await guarded("users", async () => {
      const { users: list } = await api.searchUsers(companyId);
      const staff = await getDb()
        .select({ membershipId: businessMemberships.id, email: users.email })
        .from(businessMemberships)
        .innerJoin(users, eq(users.id, businessMemberships.userId))
        .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.isActive, true)));
      const byEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s.membershipId]));
      for (const u of (list ?? []).filter((x) => !x.deleted)) {
        const name = u.name ?? [u.firstName, u.lastName].filter(Boolean).join(" ") ?? "GHL user";
        const membershipId = u.email ? byEmail.get(u.email.toLowerCase()) ?? null : null;
        await getDb()
          .insert(ghlUsers)
          .values({ businessId, ghlUserId: u.id, name: name || "GHL user", email: u.email ?? null, membershipId, fetchedAt: new Date() })
          .onConflictDoUpdate({
            target: [ghlUsers.businessId, ghlUsers.ghlUserId],
            // Keep a manual mapping; only fill when nothing is mapped yet.
            set: { name: name || "GHL user", email: u.email ?? null, fetchedAt: new Date(), membershipId: sql`coalesce(${ghlUsers.membershipId}, ${membershipId})` },
          })
          .catch(() => undefined); // a membership already mapped to another GHL user — leave for manual mapping
      }
      out.users = list?.length ?? 0;
    });
  } else notes.push("users: company id unknown");

  return { status: "synced", note: notes.length ? notes.join("; ") : null, result: out };
};
