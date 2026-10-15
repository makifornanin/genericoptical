import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { customers as customersTable, integrationConnections, integrationSyncEvents, leads } from "@/server/db/schema";
import { getGhlStatus, handleGhlWebhook, processGhlOutbox, saveGhlConnection, testGhlConnection, verifyWebhookSecret } from "@/server/integrations/ghl";
import * as leadsSvc from "@/server/services/leads";
import { createBusiness, customer, type Fixture } from "./fixtures";

const TOKEN = "pit-test-token-0123456789";
const LOCATION = "loc_TEST12345";

type Call = { method: string; url: URL; headers: Record<string, string>; body: unknown };

/** A scripted stand-in for the LeadConnector API that records every request. */
function fakeGhl(routes: (call: Call) => { status?: number; json?: unknown } | undefined) {
  const calls: Call[] = [];
  const impl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = { method: init?.method ?? "GET", url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const r = routes(call) ?? { status: 404, json: { message: "not found" } };
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const okGhl = (contactId = "ghl_contact_1") =>
  fakeGhl((c) => {
    if (c.url.pathname === "/contacts/search/duplicate") return { json: { contact: null } };
    if (c.url.pathname === "/contacts/" && c.method === "POST") return { json: { contact: { id: contactId, tags: [] } } };
    if (c.url.pathname.endsWith("/tags")) return { json: { tags: [] } };
    return undefined;
  });

async function connect(f: Fixture) {
  await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
  const r = await testGhlConnection(f.ctx.owner, okGhl().impl);
  expect(r.ok).toBe(true);
}

async function secretFor(f: Fixture) {
  const s = await getGhlStatus(f.ctx.owner);
  return s.webhookSecret!;
}

const outbound = (businessId: string) =>
  getDb()
    .select()
    .from(integrationSyncEvents)
    .where(and(eq(integrationSyncEvents.businessId, businessId), eq(integrationSyncEvents.direction, "outbound")));

let f: Fixture;
beforeEach(async () => {
  f = await createBusiness("G");
});

describe("connection management", () => {
  it("stores the token encrypted and stays unconnected until verified", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const [row] = await getDb().select().from(integrationConnections).where(eq(integrationConnections.businessId, f.businessId));
    expect(row.status).toBe("not_configured");
    expect(row.credentialsEncrypted).toBeTruthy();
    expect(row.credentialsEncrypted).not.toContain(TOKEN);
    expect(JSON.stringify(row)).not.toContain(TOKEN);

    // Nothing is queued while unverified.
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Queued", lastName: "Not", email: "q@example.com", source: "walk_in" });
    expect(await outbound(f.businessId)).toHaveLength(0);
  });

  it("marks the connection as errored when GoHighLevel rejects the token", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const denied = fakeGhl(() => ({ status: 401, json: { message: "Invalid JWT" } }));
    const r = await testGhlConnection(f.ctx.owner, denied.impl);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Access denied by GoHighLevel") });
    const s = await getGhlStatus(f.ctx.owner);
    expect(s.status).toBe("error");
    expect(s.lastError).toContain("Invalid JWT");
  });

  it("sends the token, API version and location on every request", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const g = okGhl();
    await testGhlConnection(f.ctx.owner, g.impl);
    expect(g.calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(g.calls[0].headers.Version).toBe("2021-07-28");
    expect(g.calls[0].url.searchParams.get("locationId")).toBe(LOCATION);
  });

  it("requires integrations.manage", async () => {
    await expect(saveGhlConnection(f.ctx.manager, { locationId: LOCATION, token: TOKEN })).rejects.toThrow();
    await expect(saveGhlConnection(f.ctx.sales, { locationId: LOCATION, token: TOKEN })).rejects.toThrow();
  });
});

describe("outbound sync (transactional outbox)", () => {
  it("pushes a new lead as a contact with a stage tag, once", async () => {
    await connect(f);
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Mara", lastName: "Lim", email: "mara@example.com", source: "walk_in" });
    const g = okGhl("ghl_mara");
    const r = await processGhlOutbox(f.businessId, { fetchImpl: g.impl });
    expect(r).toMatchObject({ processed: 1, failed: 0 });
    const create = g.calls.find((c) => c.url.pathname === "/contacts/" && c.method === "POST");
    expect(create?.body).toMatchObject({ locationId: LOCATION, firstName: "Mara", email: "mara@example.com" });
    expect(g.calls.some((c) => c.url.pathname === "/contacts/ghl_mara/tags" && JSON.stringify(c.body).includes("specta-stage-new"))).toBe(true);
    const [row] = await getDb().select().from(leads).where(eq(leads.id, lead!.id));
    expect(row.externalGhlContactId).toBe("ghl_mara");

    // Running again sends nothing — the event is already processed.
    const again = okGhl("ghl_mara");
    expect(await processGhlOutbox(f.businessId, { fetchImpl: again.impl })).toMatchObject({ processed: 0, failed: 0 });
    expect(again.calls).toHaveLength(0);
  });

  it("keeps failed events pending with back-off instead of losing them", async () => {
    await connect(f);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Retry", lastName: "Me", email: "retry@example.com", source: "walk_in" });
    const down = fakeGhl(() => ({ status: 503, json: { message: "Service unavailable" } }));
    const r = await processGhlOutbox(f.businessId, { fetchImpl: down.impl });
    expect(r).toMatchObject({ processed: 0, failed: 1 });
    const [ev] = await outbound(f.businessId);
    expect(ev.status).toBe("pending");
    expect(ev.attempts).toBe(1);
    expect(ev.lastError).toContain("Service unavailable");
    expect(ev.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does nothing when the integration is not connected", async () => {
    const g = okGhl();
    expect(await processGhlOutbox(f.businessId, { fetchImpl: g.impl })).toMatchObject({ reason: "not_connected" });
    expect(g.calls).toHaveLength(0);
  });
});

describe("inbound webhook", () => {
  const send = (businessId: string, secret: string | null, body: unknown, extra: Record<string, string> = {}) =>
    handleGhlWebhook({ businessId }, new Headers({ ...(secret ? { "x-webhook-secret": secret } : {}), ...extra }), JSON.stringify(body));

  it("compares secrets in constant time and rejects missing or wrong secrets", async () => {
    expect(verifyWebhookSecret("abc", "abc")).toBe(true);
    expect(verifyWebhookSecret("abd", "abc")).toBe(false);
    expect(verifyWebhookSecret(null, "abc")).toBe(false);
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    expect((await send(f.businessId, null, { contact_id: "x" })).status).toBe(401);
    expect((await send(f.businessId, "wrong-secret", { contact_id: "x" })).status).toBe(401);
  });

  it("refuses a valid secret from another business (tenant isolation)", async () => {
    const other = await createBusiness("H");
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    await saveGhlConnection(other.ctx.owner, { locationId: "loc_OTHER123", token: TOKEN });
    const otherSecret = await secretFor(other);
    expect((await send(f.businessId, otherSecret, { contact_id: "x", email: "x@example.com" })).status).toBe(401);
  });

  it("creates a lead once per event, even when GoHighLevel retries", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const secret = await secretFor(f);
    const body = { contact_id: "ghl_new_1", first_name: "Iris", last_name: "Tan", email: "Iris@Example.com", phone: "+63 917 555 0101", customData: { message: "Asked about progressives" } };
    const first = await send(f.businessId, secret, body, { "x-event-id": "evt-1" });
    expect(first).toMatchObject({ status: 200, body: { status: "created" } });
    const retry = await send(f.businessId, secret, body, { "x-event-id": "evt-1" });
    expect(retry).toMatchObject({ status: 200, body: { status: "duplicate" } });
    // Without an event id the body hash is the idempotency key.
    const a = await send(f.businessId, secret, { ...body, contact_id: "ghl_new_2", email: "other@example.com" });
    const b = await send(f.businessId, secret, { ...body, contact_id: "ghl_new_2", email: "other@example.com" });
    expect(a.body.status).toBe("created");
    expect(b.body.status).toBe("duplicate");

    const rows = await getDb().select().from(leads).where(eq(leads.businessId, f.businessId));
    expect(rows).toHaveLength(2);
    const iris = rows.find((l) => l.externalGhlContactId === "ghl_new_1")!;
    expect(iris).toMatchObject({ source: "gohighlevel", email: "iris@example.com", message: "Asked about progressives" });
  });

  it("only fills gaps on existing leads and never overwrites staff-entered data", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const secret = await secretFor(f);
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Paolo", lastName: "Reyes", email: "paolo@example.com", phone: "+63 917 111 2222", source: "walk_in" });
    const r = await send(f.businessId, secret, { contact_id: "ghl_paolo", first_name: "P", email: "paolo@example.com", phone: "+63 999 999 9999" }, { "x-event-id": "evt-paolo" });
    expect(r.body).toMatchObject({ status: "updated", leadId: lead!.id });
    const [row] = await getDb().select().from(leads).where(eq(leads.id, lead!.id));
    expect(row).toMatchObject({ firstName: "Paolo", phone: "+63 917 111 2222", externalGhlContactId: "ghl_paolo" });
  });

  it("ignores contacts owned by a platform customer and echoes of its own updates", async () => {
    await connect(f);
    const secret = await secretFor(f);
    const c = await customer(f, "Owned Customer");
    await getDb().update(customersTable).set({ externalGhlContactId: "ghl_owned" }).where(eq(customersTable.id, c.id));
    expect((await send(f.businessId, secret, { contact_id: "ghl_owned", email: "owned@example.com" }, { "x-event-id": "evt-owned" })).body).toMatchObject({ status: "skipped", reason: "customer_owned" });

    // Push a lead out, then receive GoHighLevel's resulting webhook for the same contact.
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Echo", lastName: "Test", email: "echo@example.com", source: "walk_in" });
    await processGhlOutbox(f.businessId, { fetchImpl: okGhl("ghl_echo").impl });
    const echo = await send(f.businessId, secret, { contact_id: "ghl_echo", email: "echo@example.com", first_name: "Changed" }, { "x-event-id": "evt-echo" });
    expect(echo.body).toMatchObject({ status: "skipped", reason: "echo" });
    const [row] = await getDb().select().from(leads).where(eq(leads.externalGhlContactId, "ghl_echo"));
    expect(row.firstName).toBe("Echo");
  });

  it("rejects malformed payloads without recording anything", async () => {
    await saveGhlConnection(f.ctx.owner, { locationId: LOCATION, token: TOKEN });
    const secret = await secretFor(f);
    const bad = await handleGhlWebhook({ businessId: f.businessId }, new Headers({ "x-webhook-secret": secret }), "{not json");
    expect(bad.status).toBe(400);
    const missing = await send(f.businessId, secret, { email: "no-id@example.com" });
    expect(missing.status).toBe(400);
    const inbound = await getDb().select().from(integrationSyncEvents).where(and(eq(integrationSyncEvents.businessId, f.businessId), eq(integrationSyncEvents.direction, "inbound")));
    expect(inbound).toHaveLength(0);
  });
});
