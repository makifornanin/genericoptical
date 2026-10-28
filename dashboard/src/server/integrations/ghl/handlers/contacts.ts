import { and, desc, eq, gte, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db";
import { customers, ghlContacts, integrationSyncEvents, leadActivities, leads } from "@/server/db/schema";
import { audit, nextNumber, systemCtx } from "@/server/services/core";
import type { GhlApi, GhlContact } from "../api";
import { apiFor } from "../connection";
import { GHL, type Handler, type HandlerOutcome } from "../engine";
import { GhlNotFoundError } from "../errors";
import { syncLeadOpportunity } from "./lead-opportunities";

/**
 * Contacts and leads.
 *
 * Ownership (see docs/GHL_ARCHITECTURE.md):
 *  - People who first arrived through GHL (forms, GHL CRM) are GHL-owned: GHL updates their lead's
 *    name/email/phone; the dashboard only adds stage tags.
 *  - Dashboard leads and all customers are dashboard-owned: the dashboard creates/updates the GHL
 *    contact; inbound GHL edits refresh the mirror but never overwrite customer records.
 *  - Contacts are matched by the stable GHL id first. Email/phone matching is used only to link a
 *    person who doesn't have a mapping yet, and only on an exact email or a phone with ≥7 digits.
 */

export const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
const usablePhone = (p: string | null | undefined) => digits(p).length >= 7;

type Person = { kind: "lead" | "customer"; id: string; firstName: string; lastName: string; email: string | null; phone: string | null; source?: string | null; externalGhlContactId: string | null };

async function loadPerson(businessId: string, kind: "lead" | "customer", id: string): Promise<Person | null> {
  if (kind === "lead") {
    const [l] = await getDb().select().from(leads).where(and(eq(leads.businessId, businessId), eq(leads.id, id))).limit(1);
    return l ? { kind, id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone, source: l.source, externalGhlContactId: l.externalGhlContactId } : null;
  }
  const [c] = await getDb().select().from(customers).where(and(eq(customers.businessId, businessId), eq(customers.id, id))).limit(1);
  return c ? { kind, id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, externalGhlContactId: c.externalGhlContactId } : null;
}

/** Upserts the mirror row and links it to the lead/customer. Returns null if the GHL contact is already linked to a different record. */
async function linkMirror(ex: Executor, businessId: string, contact: GhlContact, link: { leadId?: string | null; customerId?: string | null }) {
  const [existing] = await ex.select().from(ghlContacts).where(and(eq(ghlContacts.businessId, businessId), eq(ghlContacts.ghlContactId, contact.id))).limit(1);
  if (existing) {
    const leadClash = link.leadId && existing.leadId && existing.leadId !== link.leadId;
    const customerClash = link.customerId && existing.customerId && existing.customerId !== link.customerId;
    if (leadClash || customerClash) return { conflict: existing };
  }
  const values = {
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    email: contact.email?.toLowerCase() ?? null,
    phone: contact.phone ?? null,
    tags: contact.tags ?? [],
    source: contact.source ?? null,
    ghlUpdatedAt: contact.dateUpdated ? new Date(contact.dateUpdated) : new Date(),
    lastSyncedAt: new Date(),
    deletedAt: null,
    updatedAt: new Date(),
  };
  if (existing) {
    await ex
      .update(ghlContacts)
      .set({ ...values, leadId: link.leadId ?? existing.leadId, customerId: link.customerId ?? existing.customerId })
      .where(eq(ghlContacts.id, existing.id));
  } else {
    await ex
      .insert(ghlContacts)
      .values({ ...values, businessId, ghlContactId: contact.id, leadId: link.leadId ?? null, customerId: link.customerId ?? null })
      .onConflictDoNothing();
  }
  return { conflict: null };
}

/**
 * Finds or creates the GHL contact for a dashboard lead/customer. Order: existing mapping → stored id →
 * GHL duplicate search (email, then phone) → create. Never matches on name.
 */
export async function ensureContact(api: GhlApi, businessId: string, person: Person, opts: { pushIdentity: boolean }): Promise<{ contactId: string; created: boolean } | { conflict: string }> {
  const [mapped] = await getDb()
    .select()
    .from(ghlContacts)
    .where(and(eq(ghlContacts.businessId, businessId), person.kind === "lead" ? eq(ghlContacts.leadId, person.id) : eq(ghlContacts.customerId, person.id), isNull(ghlContacts.deletedAt)))
    .limit(1);
  let contactId: string | null = mapped?.ghlContactId ?? person.externalGhlContactId ?? null;
  let created = false;
  const identity = { firstName: person.firstName, lastName: person.lastName || undefined, name: `${person.firstName} ${person.lastName}`.trim(), email: person.email ?? undefined, phone: person.phone ?? undefined };
  let contact: GhlContact | null = null;
  if (contactId) {
    try {
      contact = opts.pushIdentity ? (await api.updateContact(contactId, identity)).contact : (await api.getContact(contactId)).contact;
    } catch (error) {
      if (!(error instanceof GhlNotFoundError)) throw error;
      contactId = null; // deleted in GHL — fall through to search/create
    }
  }
  if (!contactId) {
    const found =
      (person.email ? (await api.findDuplicate({ email: person.email })).contact : null) ??
      (usablePhone(person.phone) ? (await api.findDuplicate({ number: person.phone })).contact : null);
    if (found) {
      contactId = found.id;
      contact = opts.pushIdentity ? (await api.updateContact(found.id, identity)).contact : found;
    } else {
      // Website leads keep the plain "Website" source so GHL reports attribute them to the site.
      const source = person.kind === "customer" ? "Optical dashboard (customer)" : person.source === "website" ? "Website" : `Optical dashboard (${person.source ?? "lead"})`;
      contact = (await api.createContact({ ...identity, source })).contact;
      contactId = contact.id;
      created = true;
    }
  }
  const outcome = await getDb().transaction(async (tx) => {
    const res = await linkMirror(tx, businessId, contact ?? { id: contactId! }, person.kind === "lead" ? { leadId: person.id } : { customerId: person.id });
    if (res.conflict) return res;
    // Keep the convenience column in step, unless another record already holds it.
    const table = person.kind === "lead" ? leads : customers;
    const [holder] = await tx.select({ id: table.id }).from(table).where(and(eq(table.businessId, businessId), eq(table.externalGhlContactId, contactId!))).limit(1);
    if (!holder) await tx.update(table).set({ externalGhlContactId: contactId! }).where(and(eq(table.businessId, businessId), eq(table.id, person.id)));
    return res;
  });
  if (outcome.conflict) {
    const other = outcome.conflict;
    return { conflict: `GHL contact ${contactId} is already linked to another ${other.customerId ? "customer" : "lead"} in the dashboard (possible duplicate person). Merge the duplicates, then retry.` };
  }
  return { contactId: contactId!, created };
}

async function stageTag(api: GhlApi, contactId: string, prefix: string, stage: string, previousTags: string[]) {
  const tag = `${prefix}-stage-${stage}`;
  const stale = previousTags.filter((t) => t.startsWith(`${prefix}-stage-`) && t !== tag);
  if (stale.length) await api.removeTags(contactId, stale);
  await api.addTags(contactId, [tag]);
  return tag;
}

export const leadUpsert: Handler = async (event, env): Promise<HandlerOutcome> => {
  const person = await loadPerson(env.businessId, "lead", event.entityId!);
  if (!person) return { status: "skipped", note: "Lead no longer exists" };
  if (!person.email && !usablePhone(person.phone) && !person.externalGhlContactId) return { status: "skipped", note: "Lead has no email or usable phone to match in GHL" };
  const { api, settings } = await apiFor(env.businessId);
  const ghlOwned = person.source === "gohighlevel";
  const res = await ensureContact(api, env.businessId, person, { pushIdentity: !ghlOwned });
  if ("conflict" in res) return { status: "needs_review", note: res.conflict };
  const [lead] = await getDb().select({ stage: leads.stage }).from(leads).where(eq(leads.id, person.id)).limit(1);
  let tag: string | null = null;
  if (settings.stageTags && lead) {
    const [mirror] = await getDb().select({ tags: ghlContacts.tags }).from(ghlContacts).where(and(eq(ghlContacts.businessId, env.businessId), eq(ghlContacts.ghlContactId, res.contactId))).limit(1);
    tag = await stageTag(api, res.contactId, settings.tagPrefix, lead.stage, mirror?.tags ?? []);
  }
  // One opportunity per lead in the mapped lead pipeline (created once, then kept in step).
  const opportunity = await syncLeadOpportunity(api, env.businessId, settings, person.id, res.contactId);
  return { status: "synced", externalId: res.contactId, result: { created: res.created, tag, identityPushed: !ghlOwned, opportunity } };
};

export const customerUpsert: Handler = async (event, env) => {
  const person = await loadPerson(env.businessId, "customer", event.entityId!);
  if (!person) return { status: "skipped", note: "Customer no longer exists" };
  if (!person.email && !usablePhone(person.phone) && !person.externalGhlContactId) return { status: "skipped", note: "Customer has no email or usable phone to match in GHL" };
  const { api } = await apiFor(env.businessId);
  const res = await ensureContact(api, env.businessId, person, { pushIdentity: true });
  if ("conflict" in res) return { status: "needs_review", note: res.conflict };
  return { status: "synced", externalId: res.contactId, result: { created: res.created } };
};

/** Order ready for pickup → re-apply the trigger tag so a GHL workflow can message the customer. */
export const orderReady: Handler = async (event, env) => {
  const [row] = await getDb().execute<{ customer_id: string | null; sms: boolean | null }>(sql`
    select s.customer_id, c.sms_consent as sms from sales s left join customers c on c.id = s.customer_id
    where s.business_id = ${env.businessId} and s.id = ${event.entityId}`).then((r) => r.rows);
  if (!row?.customer_id) return { status: "skipped", note: "Order has no customer" };
  if (!row.sms) return { status: "skipped", note: "Customer hasn't consented to SMS updates" };
  const person = await loadPerson(env.businessId, "customer", row.customer_id);
  if (!person || (!person.email && !usablePhone(person.phone))) return { status: "skipped", note: "Customer has no email or phone" };
  const { api, settings } = await apiFor(env.businessId);
  const res = await ensureContact(api, env.businessId, person, { pushIdentity: true });
  if ("conflict" in res) return { status: "needs_review", note: res.conflict };
  await api.removeTags(res.contactId, [settings.orderReadyTag]).catch(() => undefined);
  await api.addTags(res.contactId, [settings.orderReadyTag]);
  return { status: "synced", externalId: res.contactId, result: { tag: settings.orderReadyTag } };
};

/** True when the platform itself pushed this contact in the last two minutes (webhook echo). */
async function isEcho(businessId: string, contactId: string) {
  const [echo] = await getDb()
    .select({ id: integrationSyncEvents.id })
    .from(integrationSyncEvents)
    .where(
      and(
        eq(integrationSyncEvents.businessId, businessId),
        eq(integrationSyncEvents.provider, GHL),
        eq(integrationSyncEvents.direction, "outbound"),
        eq(integrationSyncEvents.externalId, contactId),
        eq(integrationSyncEvents.status, "synced"),
        gte(integrationSyncEvents.processedAt, new Date(Date.now() - 120_000)),
      ),
    )
    .limit(1);
  return Boolean(echo);
}

/**
 * Inbound ContactCreate / ContactUpdate / ContactTagUpdate / ContactDelete (marketplace webhook) and
 * workflow-webhook contacts. Stale deliveries (older dateUpdated than the mirror) are ignored.
 */
export const inboundContact: Handler = async (event, env) => {
  const payload = (event.payload ?? {}) as { type?: string; contact?: GhlContact } & GhlContact;
  const contact: GhlContact = payload.contact ?? payload;
  if (!contact?.id) return { status: "skipped", note: "Event has no contact id" };
  const businessId = env.businessId;
  const [mirror] = await getDb().select().from(ghlContacts).where(and(eq(ghlContacts.businessId, businessId), eq(ghlContacts.ghlContactId, contact.id))).limit(1);

  if (event.eventType === "ghl.ContactDelete") {
    if (!mirror) return { status: "skipped", note: "Unknown contact" };
    await getDb().update(ghlContacts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(ghlContacts.id, mirror.id));
    if (mirror.leadId) await getDb().insert(leadActivities).values({ businessId, leadId: mirror.leadId, type: "note", body: "The linked contact was deleted in GoHighLevel. The lead is kept here.", metadata: { contactId: contact.id } });
    return { status: "synced", externalId: contact.id, note: "Contact marked deleted (dashboard records kept)" };
  }

  const incomingUpdated = contact.dateUpdated ? new Date(contact.dateUpdated) : null;
  if (mirror?.ghlUpdatedAt && incomingUpdated && incomingUpdated < mirror.ghlUpdatedAt) return { status: "skipped", note: "Older than the version already received (out of order)" };
  const email = contact.email?.trim().toLowerCase() || null;
  const phone = contact.phone?.trim() || null;
  const firstName = (contact.firstName ?? contact.name?.split(" ")[0] ?? "").trim() || "GoHighLevel contact";
  const lastName = (contact.lastName ?? contact.name?.split(" ").slice(1).join(" ") ?? "").trim();
  const echo = await isEcho(businessId, contact.id);
  const ctx = systemCtx(businessId, "GoHighLevel");

  return getDb().transaction(async (tx) => {
    // 1. Already mapped → refresh mirror; update a GHL-owned lead's identity (never a customer's).
    if (mirror) {
      await linkMirror(tx, businessId, contact, {});
      if (mirror.leadId && !echo) {
        const [lead] = await tx.select().from(leads).where(and(eq(leads.businessId, businessId), eq(leads.id, mirror.leadId))).for("update");
        if (lead && lead.source === "gohighlevel") {
          await tx.update(leads).set({ firstName, lastName, email: email ?? lead.email, phone: phone ?? lead.phone, updatedAt: new Date() }).where(eq(leads.id, lead.id));
          return { status: "synced" as const, externalId: contact.id, result: { leadId: lead.id, updated: true } };
        }
      }
      return { status: "synced" as const, externalId: contact.id, note: echo ? "Echo of a platform update" : "Mirror refreshed (record is dashboard-owned)" };
    }
    // 2. Not mapped → link to an existing customer or open lead on exact email / usable phone.
    const phoneDigits = usablePhone(phone) ? digits(phone) : null;
    const matchCustomer = [email ? sql`lower(${customers.email}) = ${email}` : null, phoneDigits ? sql`regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}` : null].filter(Boolean);
    if (matchCustomer.length) {
      const found = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, businessId), isNull(customers.archivedAt), or(...(matchCustomer as ReturnType<typeof sql>[])))).limit(2);
      if (found.length === 1) {
        await linkMirror(tx, businessId, contact, { customerId: found[0].id });
        return { status: "synced" as const, externalId: contact.id, result: { customerId: found[0].id, linked: true } };
      }
    }
    const matchLead = [email ? sql`lower(${leads.email}) = ${email}` : null, phoneDigits ? sql`regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}` : null].filter(Boolean);
    if (matchLead.length) {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.businessId, businessId), isNull(leads.archivedAt), notInArray(leads.stage, ["converted", "lost"]), or(...(matchLead as ReturnType<typeof sql>[]))))
        .orderBy(desc(leads.createdAt))
        .limit(1)
        .for("update");
      if (lead) {
        await linkMirror(tx, businessId, contact, { leadId: lead.id });
        // Fill gaps only: GHL never overwrites what staff entered on a dashboard lead.
        await tx.update(leads).set({ email: lead.email ?? email, phone: lead.phone ?? phone, updatedAt: new Date() }).where(eq(leads.id, lead.id));
        return { status: "synced" as const, externalId: contact.id, result: { leadId: lead.id, linked: true } };
      }
    }
    // 3. New person → new GHL-owned lead.
    const code = await nextNumber(tx, businessId, "lead", "LD-", 5);
    const customMessage = (payload as unknown as { customData?: { message?: unknown } }).customData?.message;
    const message = typeof customMessage === "string" ? customMessage.slice(0, 2000) : null;
    const [created] = await tx
      .insert(leads)
      .values({ businessId, code, firstName, lastName, email, phone, source: "gohighlevel", message, externalGhlContactId: contact.id })
      .onConflictDoNothing()
      .returning({ id: leads.id });
    if (!created) return { status: "needs_review" as const, note: `Another lead already holds GHL contact ${contact.id}` };
    await linkMirror(tx, businessId, contact, { leadId: created.id });
    await tx.insert(leadActivities).values({ businessId, leadId: created.id, type: "created", toStage: "new", body: "Received from GoHighLevel", metadata: { contactId: contact.id, tags: contact.tags ?? [] } });
    await audit(tx, ctx, { action: "lead.created", entityType: "lead", entityId: created.id, summary: `Lead ${code} received from GoHighLevel` });
    return { status: "synced" as const, externalId: contact.id, result: { leadId: created.id, created: true } };
  });
};

/** Fetches a contact we haven't mirrored yet (used by appointment/order imports). */
export async function mirrorContactById(api: GhlApi, businessId: string, contactId: string) {
  const [mirror] = await getDb().select().from(ghlContacts).where(and(eq(ghlContacts.businessId, businessId), eq(ghlContacts.ghlContactId, contactId))).limit(1);
  if (mirror) return mirror;
  const { contact } = await api.getContact(contactId);
  await inboundContact(
    { id: "inline", businessId, provider: GHL, direction: "inbound", eventType: "ghl.ContactCreate", category: "contacts", entityType: null, entityId: null, externalId: contactId, idempotencyKey: null, status: "processing", attempts: 1, lastError: null, lastHttpStatus: null, payload: contact as unknown as Record<string, unknown>, result: null, nextAttemptAt: new Date(), lockedAt: null, lockedBy: null, createdAt: new Date(), processedAt: null, reviewedAt: null, reviewedByMembershipId: null },
    { businessId, workerId: "inline", now: () => new Date() },
  );
  const [created] = await getDb().select().from(ghlContacts).where(and(eq(ghlContacts.businessId, businessId), eq(ghlContacts.ghlContactId, contactId))).limit(1);
  return created ?? null;
}
