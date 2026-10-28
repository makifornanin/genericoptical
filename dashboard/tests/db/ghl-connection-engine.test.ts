import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { ghlContacts, integrationConnections, integrationSyncEvents, leads, oauthStates } from "@/server/db/schema";
import { completeOAuth, connectPrivateToken, disconnect, ghlOverview, handleMarketplaceWebhook, handleWorkflowWebhook, processAllDue, processGhl, retryEvents, startOAuth } from "@/server/integrations/ghl";
import { setGhlFetch } from "@/server/integrations/ghl/connection";
import { enqueue, recoverStaleLeases } from "@/server/integrations/ghl/engine";
import { verifyGhlSignature } from "@/server/integrations/ghl/webhooks";
import * as leadsSvc from "@/server/services/leads";
import { createBusiness, type Fixture } from "./fixtures";
import { FakeGhl } from "./ghl-fake";
import { connect, connection, events, fakeFor, signedHeaders, webhookBody } from "./ghl-helpers";

let f: Fixture;
let fake: FakeGhl;
beforeEach(async () => {
  f = await createBusiness("G");
  fake = fakeFor("G");
});
afterEach(() => setGhlFetch(null));

describe("connecting a sub-account", () => {
  it("verifies a private token against the sub-account and stores it encrypted", async () => {
    await connectPrivateToken(f.ctx.owner, { locationId: fake.locationId, token: "pit-test-token-123456" });
    const row = await connection(f.businessId);
    expect(row).toMatchObject({ status: "connected", authType: "private_token", externalAccountId: fake.locationId, accountName: "Test Optical Sub-account", accountTimezone: "Asia/Manila" });
    expect(JSON.stringify(row)).not.toContain("pit-test-token-123456");
    expect(fake.callsTo("GET /locations/")[0].auth).toBe("Bearer pit-test-token-123456");
  });

  it("rejects a token GHL refuses, saving nothing", async () => {
    await expect(connectPrivateToken(f.ctx.owner, { locationId: fake.locationId, token: "pit-wrong-token-000" })).rejects.toThrow();
    expect(await connection(f.businessId)).toBeUndefined();
  });

  it("requires integrations.manage", async () => {
    await expect(connectPrivateToken(f.ctx.manager, { locationId: fake.locationId, token: "pit-test-token-123456" })).rejects.toThrow(/permission/i);
    await expect(startOAuth(f.ctx.sales)).rejects.toThrow(/permission/i);
  });

  it("allows one sub-account per business and one business per sub-account", async () => {
    await connect(f, fake);
    const other = await createBusiness("H");
    await expect(connectPrivateToken(other.ctx.owner, { locationId: fake.locationId, token: "pit-test-token-123456" })).rejects.toThrow(/already connected to another business/);
  });

  it("OAuth: binds state to the member, exchanges the code once, verifies the location", async () => {
    const url = new URL(await startOAuth(f.ctx.owner));
    expect(url.pathname).toBe("/v2/oauth/chooselocation");
    expect(url.searchParams.get("scope")).toContain("contacts.write");
    const state = url.searchParams.get("state")!;
    expect(state.length).toBeGreaterThan(20);

    // Another member of the same business can't use it.
    await expect(completeOAuth(f.ctx.manager.permissions.has("integrations.manage") ? f.ctx.manager : { ...f.ctx.manager, permissions: new Set([...f.ctx.manager.permissions, "integrations.manage"]) }, { code: `code:${fake.locationId}`, state })).rejects.toThrow(/expired or was started by someone else/);

    const r = await completeOAuth(f.ctx.owner, { code: `code:${fake.locationId}`, state });
    expect(r.locationId).toBe(fake.locationId);
    const row = await connection(f.businessId);
    expect(row).toMatchObject({ status: "connected", authType: "oauth" });
    expect(row.refreshTokenEncrypted).toBeTruthy();
    expect(fake.tokenRequests[0].get("grant_type")).toBe("authorization_code");
    expect(fake.tokenRequests[0].get("user_type")).toBe("Location");

    // The state is single-use.
    await expect(completeOAuth(f.ctx.owner, { code: `code:${fake.locationId}`, state })).rejects.toThrow(/expired/);
    const [st] = await getDb().select().from(oauthStates).where(eq(oauthStates.businessId, f.businessId));
    expect(st.usedAt).toBeTruthy();
  });

  it("OAuth: refuses an agency-level authorisation (one business = one sub-account)", async () => {
    const state = new URL(await startOAuth(f.ctx.owner)).searchParams.get("state");
    await expect(completeOAuth(f.ctx.owner, { code: "company:cmp_TEST", state })).rejects.toThrow(/agency-level/);
  });

  it("refreshes an expired OAuth token once, even when several calls need it at the same time", async () => {
    const state = new URL(await startOAuth(f.ctx.owner)).searchParams.get("state");
    await completeOAuth(f.ctx.owner, { code: `code:${fake.locationId}`, state });
    await processGhl(f.businessId);
    // Force expiry locally and at GHL.
    await getDb().update(integrationConnections).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(integrationConnections.businessId, f.businessId));
    fake.expireAccessTokens();
    const before = fake.tokenRequests.filter((p) => p.get("grant_type") === "refresh_token").length;
    const { apiFor } = await import("@/server/integrations/ghl/connection");
    const [a, b] = await Promise.all([apiFor(f.businessId), apiFor(f.businessId)]);
    await Promise.all([a.api.getLocation(), b.api.getLocation()]);
    const refreshes = fake.tokenRequests.filter((p) => p.get("grant_type") === "refresh_token").length - before;
    expect(refreshes).toBe(1); // single-use refresh tokens: a second refresh would have failed
    expect((await connection(f.businessId)).status).toBe("connected");
  });

  it("marks the connection 'reconnect required' when the refresh token is revoked, and queues changes safely", async () => {
    const state = new URL(await startOAuth(f.ctx.owner)).searchParams.get("state");
    await completeOAuth(f.ctx.owner, { code: `code:${fake.locationId}`, state });
    await processGhl(f.businessId);
    await getDb().update(integrationConnections).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(integrationConnections.businessId, f.businessId));
    fake.expireAccessTokens();
    fake.refreshTokens.clear(); // revoked in GHL
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Queued", lastName: "Lead", email: "queued@example.com", source: "walk_in" });
    const r = await processGhl(f.businessId);
    expect(r.paused).toBe("reauth_required");
    expect((await connection(f.businessId)).status).toBe("reauth_required");
    const [ev] = await events(f.businessId, "lead.upsert");
    expect(ev.status).toBe("retry_scheduled"); // kept, not lost
  });

  it("disconnect deletes credentials, stops queued work; 'forget' clears mirrors but never dashboard records", async () => {
    await connect(f, fake);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Kept", lastName: "Lead", email: "kept@example.com", source: "walk_in" });
    await processGhl(f.businessId);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Queued", lastName: "Two", email: "two@example.com", source: "walk_in" });
    await disconnect(f.ctx.owner, { forget: true });
    const row = await connection(f.businessId);
    expect(row).toMatchObject({ status: "disabled", credentialsEncrypted: null, accessTokenEncrypted: null, externalAccountId: null });
    const queued = (await events(f.businessId, "lead.upsert")).filter((e) => e.status === "skipped" && e.lastError === "Integration disconnected");
    expect(queued).toHaveLength(1);
    expect(await getDb().select().from(ghlContacts).where(eq(ghlContacts.businessId, f.businessId))).toHaveLength(0);
    expect(await getDb().select().from(leads).where(eq(leads.businessId, f.businessId))).toHaveLength(2);
  });
});

describe("durable sync engine", () => {
  it("writes outbound events in the business transaction — a rolled-back change sends nothing", async () => {
    await connect(f, fake);
    await expect(
      getDb().transaction(async (tx) => {
        const { onLeadChanged } = await import("@/server/integrations/ghl/triggers");
        await onLeadChanged(tx, f.businessId, randomUUID());
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await events(f.businessId, "lead.upsert")).toHaveLength(0);
  });

  it("coalesces repeated changes to one record into one pending event", async () => {
    await connect(f, fake);
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Many", lastName: "Edits", email: "many@example.com", source: "walk_in" });
    for (let i = 0; i < 3; i++) await leadsSvc.updateLead(f.ctx.owner, lead!.id, { firstName: `Many${i}`, lastName: "Edits", email: "many@example.com", source: "walk_in" });
    expect((await events(f.businessId, "lead.upsert")).filter((e) => e.status === "pending")).toHaveLength(1);
  });

  it("retries transient failures with back-off and only marks synced after GHL confirms", async () => {
    await connect(f, fake);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Flaky", lastName: "Net", email: "flaky@example.com", source: "walk_in" });
    fake.fail("GET /contacts/search/duplicate", 0, { network: true });
    let r = await processGhl(f.businessId);
    expect(r.retried).toBe(1);
    let [ev] = await events(f.businessId, "lead.upsert");
    expect(ev).toMatchObject({ status: "retry_scheduled", attempts: 1 });
    expect(ev.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 15_000);
    await getDb().update(integrationSyncEvents).set({ nextAttemptAt: new Date() }).where(eq(integrationSyncEvents.id, ev.id));
    r = await processGhl(f.businessId);
    [ev] = await events(f.businessId, "lead.upsert");
    expect(ev.status).toBe("synced");
    expect(ev.externalId).toMatch(/^ct_/);
  });

  it("pauses the business on 429 and defers the rest of the batch without counting attempts", async () => {
    await connect(f, fake);
    for (const n of ["a", "b", "c"]) await leadsSvc.createLead(f.ctx.owner, { firstName: `Rate${n}`, lastName: "Limit", email: `rate${n}@example.com`, source: "walk_in" });
    fake.fail("GET /contacts/search/duplicate", 429, { headers: { "retry-after": "30" } });
    const r = await processGhl(f.businessId);
    expect(r.paused).toBe("rate_limited");
    const evs = await events(f.businessId, "lead.upsert");
    expect(evs.every((e) => e.status === "retry_scheduled" && e.attempts === 0)).toBe(true);
    expect((await connection(f.businessId)).rateLimitedUntil!.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect((await processGhl(f.businessId)).paused).toBe("rate_limited");
  });

  it("sends missing-scope failures to review and gives up (dead letter) after the maximum attempts", async () => {
    await connect(f, fake);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "No", lastName: "Scope", email: "noscope@example.com", source: "walk_in" });
    fake.fail("GET /contacts/search/duplicate", 403, { body: { message: "The token is not authorized for this scope" } });
    await processGhl(f.businessId);
    const [ev] = await events(f.businessId, "lead.upsert");
    expect(ev.status).toBe("needs_review");
    expect(ev.lastError).toMatch(/scopes/);

    // Dead letter: a server error on the 8th attempt.
    await retryEvents(f.businessId, [ev.id], f.membership.owner);
    await getDb().update(integrationSyncEvents).set({ attempts: 7 }).where(eq(integrationSyncEvents.id, ev.id));
    fake.fail("GET /contacts/search/duplicate", 500);
    await processGhl(f.businessId);
    const [dead] = await events(f.businessId, "lead.upsert");
    expect(dead.status).toBe("failed");
    expect(dead.lastError).toMatch(/Gave up after 8 attempts/);
  });

  it("recovers events abandoned by a crashed worker", async () => {
    await connect(f, fake);
    const id = await enqueue(getDb(), { businessId: f.businessId, direction: "outbound", eventType: "system.refresh_metadata", category: "system", payload: {} });
    await getDb().update(integrationSyncEvents).set({ status: "processing", lockedAt: new Date(Date.now() - 11 * 60_000), lockedBy: "dead-worker" }).where(eq(integrationSyncEvents.id, id!));
    expect(await recoverStaleLeases()).toBeGreaterThanOrEqual(1);
    await processGhl(f.businessId);
    const [ev] = (await events(f.businessId, "system.refresh_metadata")).filter((e) => e.id === id);
    expect(ev.status).toBe("synced");
  });

  it("flags a stalled backlog (worker not running) and work left mid-send, for the monitoring screen", async () => {
    await connect(f, fake);
    expect((await ghlOverview(f.ctx.owner)).backlog).toMatchObject({ stale: false, stuckEvents: 0 });
    const old = await enqueue(getDb(), { businessId: f.businessId, direction: "outbound", eventType: "system.refresh_metadata", category: "system", payload: {}, idempotencyKey: `old-${randomUUID()}` });
    await getDb().update(integrationSyncEvents).set({ createdAt: new Date(Date.now() - 45 * 60_000) }).where(eq(integrationSyncEvents.id, old!));
    const stuck = await enqueue(getDb(), { businessId: f.businessId, direction: "outbound", eventType: "system.refresh_metadata", category: "system", payload: {}, idempotencyKey: `stuck-${randomUUID()}` });
    await getDb().update(integrationSyncEvents).set({ status: "processing", lockedAt: new Date(Date.now() - 15 * 60_000), lockedBy: "dead-worker" }).where(eq(integrationSyncEvents.id, stuck!));
    const { backlog } = await ghlOverview(f.ctx.owner);
    expect(backlog.stale).toBe(true);
    expect(backlog.stuckEvents).toBe(1);
    // Once the worker runs, the warning clears.
    await recoverStaleLeases();
    await processGhl(f.businessId);
    expect((await ghlOverview(f.ctx.owner)).backlog).toMatchObject({ stale: false, stuckEvents: 0 });
  });

  it("isolates businesses in the scheduled worker", async () => {
    await connect(f, fake);
    const g = await createBusiness("I");
    const fake2 = new FakeGhl(`loc_I_${randomUUID().slice(0, 6)}`);
    fake2.accessTokens.clear();
    fake2.accessTokens.set("pit-second-token-654321", fake2.locationId);
    // Each sub-account has its own token, so route by the Authorization header.
    const both: typeof fetch = (input, init) => (new Headers(init?.headers).get("authorization")?.includes("pit-second") ? fake2.fetch(input, init) : fake.fetch(input, init));
    setGhlFetch(both);
    await connectPrivateToken(g.ctx.owner, { locationId: fake2.locationId, token: "pit-second-token-654321" });
    await processGhl(g.businessId);
    await leadsSvc.createLead(f.ctx.owner, { firstName: "Biz", lastName: "One", email: "one@example.com", source: "walk_in" });
    await leadsSvc.createLead(g.ctx.owner, { firstName: "Biz", lastName: "Two", email: "two@example.com", source: "walk_in" });
    // Business G's deliveries all fail with 500.
    fake.fail((c) => c.method === "GET" && c.path === "/contacts/search/duplicate" && c.query.email === "one@example.com", 500, { times: 5 });
    const out = await processAllDue();
    expect(Object.keys(out.results)).toEqual(expect.arrayContaining([f.businessId, g.businessId]));
    expect((await events(g.businessId, "lead.upsert"))[0].status).toBe("synced");
    expect((await events(f.businessId, "lead.upsert"))[0].status).toBe("retry_scheduled");
  });
});

describe("webhook security", () => {
  it("verifies HighLevel's Ed25519 signature over the raw body and rejects tampering", () => {
    const body = JSON.stringify({ type: "ContactCreate", locationId: "x", id: "c1" });
    expect(verifyGhlSignature(body, signedHeaders(body)).ok).toBe(true);
    expect(verifyGhlSignature(body.replace("c1", "c2"), signedHeaders(body)).ok).toBe(false);
    expect(verifyGhlSignature(body, new Headers()).ok).toBe(false);
    const otherKey = generateKeyPairSync("ed25519").privateKey;
    const forged = new Headers({ "x-ghl-signature": sign(null, Buffer.from(body), otherKey).toString("base64") });
    expect(verifyGhlSignature(body, forged).ok).toBe(false);
  });

  it("routes by location, ignores unknown locations, deduplicates deliveries and handles uninstall", async () => {
    await connect(f, fake, { sync: { contacts: true, opportunities: true, appointments: true, products: false, inventory: false, sales: true, orders: false } });
    const unknown = webhookBody("ContactCreate", "loc_nobody", { id: "ct_x", email: "x@example.com" });
    expect(await handleMarketplaceWebhook(unknown, signedHeaders(unknown))).toMatchObject({ status: 200, body: { reason: "location not connected" } });

    fake.contacts.set("ct_web1", { id: "ct_web1", firstName: "Form", lastName: "Lead", email: "form@example.com", dateUpdated: new Date().toISOString() });
    const body = webhookBody("ContactCreate", fake.locationId, { id: "ct_web1", firstName: "Form", lastName: "Lead", email: "form@example.com", dateUpdated: new Date().toISOString() });
    expect((await handleMarketplaceWebhook(body, signedHeaders(body))).body.status).toBe("accepted");
    expect((await handleMarketplaceWebhook(body, signedHeaders(body))).body.status).toBe("duplicate");
    expect(await getDb().select().from(leads).where(and(eq(leads.businessId, f.businessId), eq(leads.source, "gohighlevel")))).toHaveLength(1);

    const bad = await handleMarketplaceWebhook(body.replace("Form", "Evil"), signedHeaders(body));
    expect(bad.status).toBe(401);

    const uninstall = webhookBody("UNINSTALL", fake.locationId, { appId: "app_1" });
    expect((await handleMarketplaceWebhook(uninstall, signedHeaders(uninstall))).body.status).toBe("disconnected");
    expect((await connection(f.businessId)).status).toBe("disabled");
  });

  it("refuses oversized webhook bodies before parsing or queueing anything", async () => {
    await connect(f, fake);
    const huge = JSON.stringify({ type: "ContactCreate", locationId: fake.locationId, id: "c1", pad: "x".repeat(300_000) });
    expect((await handleMarketplaceWebhook(huge, new Headers())).status).toBe(413);
    expect((await handleWorkflowWebhook(f.businessId, new Headers(), huge)).status).toBe(413);
    expect(await events(f.businessId, "ghl.ContactCreate")).toHaveLength(0);
  });

  it("workflow webhook: requires the shared secret and stops working after disconnect", async () => {
    await connect(f, fake);
    const { workflowWebhookSecret } = await import("@/server/integrations/ghl/connection");
    const secret = (await workflowWebhookSecret(f.ctx.owner))!;
    const body = JSON.stringify({ contact_id: "ct_wf1", first_name: "Work", last_name: "Flow", email: "wf@example.com" });
    expect((await handleWorkflowWebhook(f.businessId, new Headers({ "x-webhook-secret": "wrong" }), body)).status).toBe(401);
    const ok = await handleWorkflowWebhook(f.businessId, new Headers({ "x-webhook-secret": secret }), body);
    expect(ok.status).toBe(200);
    expect(await getDb().select().from(leads).where(eq(leads.externalGhlContactId, "ct_wf1"))).toHaveLength(1);
    await disconnect(f.ctx.owner);
    expect((await handleWorkflowWebhook(f.businessId, new Headers({ "x-webhook-secret": secret }), body)).status).toBe(404);
  });
});
