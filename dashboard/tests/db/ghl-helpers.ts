import { randomUUID, sign, createPrivateKey } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { integrationConnections, integrationSyncEvents } from "@/server/db/schema";
import { connectPrivateToken, processGhl, updateSettings } from "@/server/integrations/ghl";
import type { GhlSettings } from "@/server/integrations/ghl/config";
import { setGhlFetch } from "@/server/integrations/ghl/connection";
import { FakeGhl } from "./ghl-fake";
import type { Fixture } from "./fixtures";

/** A fresh simulator with a unique location, wired in as the integration's HTTP layer. */
export function fakeFor(label = "A") {
  const fake = new FakeGhl(`loc_${label}_${randomUUID().slice(0, 6)}`);
  setGhlFetch(fake.fetch);
  return fake;
}

export async function connect(f: Fixture, fake: FakeGhl, settings: Partial<GhlSettings> = {}) {
  setGhlFetch(fake.fetch);
  await connectPrivateToken(f.ctx.owner, { locationId: fake.locationId, token: "pit-test-token-123456" });
  if (Object.keys(settings).length) await updateSettings(f.ctx.owner, settings);
  // The connect step queues a metadata refresh; drain it so tests start from an empty queue.
  await processGhl(f.businessId);
}

export async function events(businessId: string, eventType?: string) {
  const rows = await getDb().select().from(integrationSyncEvents).where(eq(integrationSyncEvents.businessId, businessId));
  return eventType ? rows.filter((r) => r.eventType === eventType) : rows;
}

export async function connection(businessId: string) {
  const [row] = await getDb().select().from(integrationConnections).where(and(eq(integrationConnections.businessId, businessId))).limit(1);
  return row;
}

/** Signs a webhook body the way HighLevel does (Ed25519, base64) with the test key from setup-file. */
export function signedHeaders(body: string, extra: Record<string, string> = {}) {
  const key = createPrivateKey(process.env.GHL_TEST_WEBHOOK_PRIVATE_KEY!);
  return new Headers({ "content-type": "application/json", "x-ghl-signature": sign(null, Buffer.from(body), key).toString("base64"), ...extra });
}

export function webhookBody(type: string, locationId: string, data: Record<string, unknown>) {
  return JSON.stringify({ type, locationId, webhookId: randomUUID(), timestamp: new Date().toISOString(), ...data });
}
