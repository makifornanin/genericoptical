# Integrations

| Integration | State in this build |
|---|---|
| GoHighLevel (LeadConnector API v2) | Implemented for contacts, stage tags, an order-ready trigger tag and an inbound contact webhook. **Off until each business connects and passes the connection test.** Covered by automated tests against a mocked API; **not yet exercised against a live GoHighLevel sub-account.** |
| Payments (cash, card, bank transfer, GCash, Maya, other) | **Recorded manually.** No payment gateway is connected. |
| Email | **Not integrated.** An adapter exists (`src/server/mail.ts`) but sends nothing. |
| SMS | Only indirectly, through a GoHighLevel workflow triggered by a tag. |
| File storage (expense receipts) | Local disk (`UPLOAD_DIR`). Needs an object-storage adapter on serverless hosts. |

---

## GoHighLevel

### What syncs

| Direction | Trigger | What happens |
|---|---|---|
| Platform → GHL | Lead created or edited (staff or website) | Find the contact by email, then by phone (`GET /contacts/search/duplicate`), or create it (`POST /contacts/`). The GHL contact ID is stored on the lead. |
| Platform → GHL | Lead stage changes (including conversion) | Adds tag `<prefix>-stage-<stage>` (for example `specta-stage-qualified`) if *Push lead stage tags* is on. |
| Platform → GHL | Order marked **Ready for pickup** | Re-applies the *order-ready* tag (default `order-ready`) to the customer's contact. It is removed first, so a workflow re-triggers. **Only for customers with SMS consent.** Build a GHL workflow on "tag added" to send the message. |
| GHL → Platform | Webhook from a GHL workflow | Creates a lead (source *GoHighLevel*), or links and fills gaps on an existing lead with the same contact ID or email. |

Not implemented, because these endpoints weren't verified for this build: opportunity/pipeline sync, calendar/appointment sync, conversations, and custom fields. Appointment events are queued but marked *skipped* with the note "Calendar sync isn't enabled in this version". The *Appointments system of record* setting only records which system owns bookings.

### Connecting a sub-account

1. In GoHighLevel, open **Settings → Private Integrations**, create a token with the **contacts read and write** scopes, and copy it.
2. In the platform, open **Settings → Integrations**. Enter the sub-account (location) ID and the token, then **Save**. The token is encrypted with AES-256-GCM using `APP_SECRET` before it is stored. It is never sent back to the browser.
3. Click **Test connection**. This makes a harmless duplicate-search request. Only a successful test sets the status to *Connected*. Until then nothing is queued or sent, and the UI shows *Not configured* or *Error* with the reason.
4. Changing the token or location ID resets the status until it is tested again. **Disconnect** deletes the stored token.

### Delivery and retries (transactional outbox)

- Outbound events are written to `integration_sync_events` **in the same database transaction** as the business change. A rolled-back sale or lead change therefore never leaks to GHL, and a committed change is never lost.
- Events are sent by **Sync now** (Settings → Integrations) or by a scheduler calling `POST /api/integrations/ghl/process` with `Authorization: Bearer $CRON_SECRET` (every 5 minutes is reasonable). Without `CRON_SECRET` that endpoint returns 503.
- Workers claim events with `FOR UPDATE SKIP LOCKED`, so concurrent runs never send the same event twice. Failures back off exponentially (2ⁿ × 30 s). After 6 attempts an event is marked *failed*. The last error is visible in Settings.

### Inbound webhook

- URL: `POST {APP_URL}/api/integrations/ghl/webhook/{business-slug}` (shown in Settings).
- Authentication: header `x-webhook-secret: <secret shown in Settings>`, compared in constant time. A missing or wrong secret, or another business's secret, returns 401.
- Idempotency: send `x-event-id` if the workflow can. Otherwise a SHA-256 of the body is the key. Repeated deliveries return `{"status":"duplicate"}` and change nothing. The event record and its effects commit together, so a failed delivery can be retried safely.
- Accepted fields: `contact_id`/`contactId`/`id` (required), `first_name`/`firstName`, `last_name`/`lastName`, `full_name`, `email`, `phone`, `customData.message`. Bodies over 100 KB are rejected.

### Loop prevention and ownership

- Leads and customers created in the platform are **owned by the platform**. GHL receives copies.
- Inbound updates for a contact the platform pushed in the last 2 minutes are treated as **echoes** and skipped.
- Inbound updates for a contact linked to a platform **customer** are skipped.
- Inbound updates to an existing lead **only fill empty fields**. They never overwrite what staff entered.

### Verification status

`tests/db/ghl.test.ts` (13 tests) covers: encrypted storage, staying unconnected until tested, error handling when GHL rejects the token, headers (Bearer token, `Version: 2021-07-28`, location ID), contact creation and tagging, no re-sending after success, back-off on failure, permission checks, webhook secret checks including cross-business secrets, idempotent deliveries, fill-only updates, customer-owned and echo suppression, and malformed payloads. All of these run against a scripted stand-in for the API. **Before relying on the integration, connect a test sub-account and confirm a lead appears in GHL with its stage tag.**

---

## Payments

The POS, orders and the payment dialog **record** payments that were verified outside the system: cash in the drawer, an approval code from the card terminal, or a GCash, Maya or bank reference. The UI says so next to every payment control. Safeguards:

- A payment can't exceed the balance due. Overpayment becomes change for cash only.
- References are unique per method within a business, so the same GCash reference can't be recorded twice.
- Every payment and refund carries an idempotency key, so a double-click or a retried request writes once.
- Payments are voided, never deleted. A void restores the balance and is audited.

To accept online payments, integrate a provider (for example PayMongo or Xendit for GCash and Maya) and record the payment from its verified webhook through the same service function, `recordPayment`.

## Email

`sendMail()` logs messages to the server console in development and reports *not delivered* in production. `emailDeliveryAvailable()` returns `false`, and the forgot-password screen says plainly that email isn't set up and to ask an owner for a temporary password (**Staff → Set temporary password**). To enable email, implement a provider in `src/server/mail.ts` and return `true` from `emailDeliveryAvailable()`.
