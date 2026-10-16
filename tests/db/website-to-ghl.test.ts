import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as inquiryPOST } from "@/app/api/public/v1/inquiries/route";
import { getDb } from "@/server/db";
import { ghlContacts, leads } from "@/server/db/schema";
import { processGhl } from "@/server/integrations/ghl";
import { createSiteKey } from "@/server/services/public-api";
import { createBusiness, type Fixture } from "./fixtures";
import { connect, events, fakeFor } from "./ghl-helpers";

/*
 * Cross-system path for a website inquiry: website server → dashboard public API → lead → durable
 * outbox → GoHighLevel contact. GoHighLevel is the in-memory simulator (tests/db/ghl-fake.ts), so this
 * proves the dashboard side, not the live GHL account.
 */

let f: Fixture;
let key: string;
beforeAll(async () => {
  f = await createBusiness("WebGhl");
  key = (await createSiteKey(f.businessId, "Website")).key;
});

const inquiry = (body: Record<string, unknown>) =>
  inquiryPOST(new Request("http://dash.test/api/public/v1/inquiries", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("website inquiry → GoHighLevel", () => {
  it("queues lead.upsert and creates one contact with source Website, reusing an existing contact on repeat", async () => {
    const fake = fakeFor("web");
    await connect(f, fake);
    const res = await inquiry({ fullName: "Web Lead", email: "web.lead@example.com", interest: "frames", kind: "product_inquiry", productName: "Arden 101", sourcePage: "/eyewear/arden-101" });
    expect(res.status).toBe(201);
    const [lead] = await getDb().select().from(leads).where(eq(leads.email, "web.lead@example.com"));
    expect(await events(f.businessId, "lead.upsert")).toEqual([expect.objectContaining({ entityId: lead.id })]);

    await processGhl(f.businessId);
    const [mirror] = await getDb().select().from(ghlContacts).where(eq(ghlContacts.leadId, lead.id));
    expect(fake.contacts.get(mirror.ghlContactId)).toMatchObject({ email: "web.lead@example.com", source: "Website" });

    // Same person again: no second lead, no second contact.
    expect((await inquiry({ fullName: "Web Lead", email: "WEB.LEAD@example.com", message: "Any news?" })).status).toBe(201);
    await processGhl(f.businessId);
    expect(await getDb().select().from(leads).where(eq(leads.businessId, f.businessId))).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === "POST" && c.path === "/contacts/")).toHaveLength(1);
  });

  it("keeps the lead when GoHighLevel is down; the event retries instead of losing data", async () => {
    const g = await createBusiness("WebGhlDown");
    const gKey = (await createSiteKey(g.businessId, "Website")).key;
    const fake = fakeFor("down");
    await connect(g, fake);
    fake.fail((c) => c.path.startsWith("/contacts"), 503, { times: 20 });
    const res = await inquiryPOST(
      new Request("http://dash.test/api/public/v1/inquiries", { method: "POST", headers: { authorization: `Bearer ${gKey}`, "content-type": "application/json" }, body: JSON.stringify({ fullName: "Outage Lead", email: "outage@example.com" }) }),
    );
    expect(res.status).toBe(201);
    await processGhl(g.businessId);
    const [lead] = await getDb().select().from(leads).where(eq(leads.email, "outage@example.com"));
    expect(lead.source).toBe("website");
    const [event] = await events(g.businessId, "lead.upsert").then((rows) => rows.filter((r) => r.entityId === lead.id));
    expect(["retry_scheduled", "pending"]).toContain(event.status);
  });
});
