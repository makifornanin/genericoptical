import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { connection } from "next/server";
import journal from "../../../../drizzle/meta/_journal.json";
import { getDb } from "@/server/db";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Liveness + database connectivity for uptime monitors and deploy smoke tests.
 *
 * With `Authorization: Bearer $CRON_SECRET` it also reports operational detail: whether every migration
 * shipped with this build is applied, and the integration sync backlog (counts only — no customer data,
 * no tokens). Anyone else gets the short public answer.
 */
export async function GET(request: Request) {
  await connection(); // always run at request time, never prerendered
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503, headers: NO_STORE });
  }
  const latencyMs = Date.now() - started;
  if (!authorized(request)) return Response.json({ status: "ok", database: "ok", latencyMs }, { headers: NO_STORE });

  const [migrations, sync] = await Promise.all([migrationState(), syncBacklog()]);
  const problems = [
    ...(migrations.pending > 0 ? [`${migrations.pending} migration(s) not applied`] : []),
    ...(sync.staleLeases > 0 ? [`${sync.staleLeases} sync event(s) stuck in processing`] : []),
    ...(sync.reauthRequired > 0 ? [`${sync.reauthRequired} integration(s) need reconnecting`] : []),
  ];
  return Response.json(
    { status: problems.length ? "degraded" : "ok", database: "ok", latencyMs, problems, migrations, sync },
    { status: migrations.pending > 0 ? 503 : 200, headers: NO_STORE },
  );
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !provided) return false;
  return timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(secret).digest());
}

/** Compares the migrations bundled with this build against drizzle's record of applied ones. */
async function migrationState() {
  const expected = journal.entries.length;
  const latest = journal.entries.at(-1);
  try {
    const res = await getDb().execute<{ applied: number; last: string | null }>(sql`select count(*)::int as applied, max(created_at)::text as last from drizzle.__drizzle_migrations`);
    const { applied, last } = res.rows[0];
    const upToDate = latest ? Number(last) >= latest.when : true;
    return { expected, applied: Number(applied), latest: latest?.tag ?? null, pending: upToDate ? 0 : Math.max(1, expected - Number(applied)) };
  } catch {
    return { expected, applied: 0, latest: latest?.tag ?? null, pending: expected };
  }
}

async function syncBacklog() {
  const res = await getDb().execute<{ status: string; n: number; oldest: string | null }>(sql`
    select status, count(*)::int as n, min(created_at)::text as oldest
    from integration_sync_events
    where status in ('pending', 'retry_scheduled', 'processing', 'failed', 'needs_review')
    group by status`);
  const byStatus = Object.fromEntries(res.rows.map((r) => [r.status, Number(r.n)]));
  const oldestPending = res.rows.filter((r) => r.status === "pending" || r.status === "retry_scheduled").map((r) => r.oldest).sort()[0] ?? null;
  const [stale] = (await getDb().execute<{ n: number }>(sql`select count(*)::int as n from integration_sync_events where status = 'processing' and locked_at < now() - interval '10 minutes'`)).rows;
  const [conn] = (
    await getDb().execute<{ reauth: number; errored: number }>(sql`
      select count(*) filter (where status = 'reauth_required')::int as reauth, count(*) filter (where status = 'error')::int as errored from integration_connections`)
  ).rows;
  return {
    pending: byStatus.pending ?? 0,
    retryScheduled: byStatus.retry_scheduled ?? 0,
    processing: byStatus.processing ?? 0,
    failed: byStatus.failed ?? 0,
    needsReview: byStatus.needs_review ?? 0,
    oldestPendingAt: oldestPending,
    staleLeases: Number(stale?.n ?? 0),
    reauthRequired: Number(conn?.reauth ?? 0),
    connectionErrors: Number(conn?.errored ?? 0),
  };
}
