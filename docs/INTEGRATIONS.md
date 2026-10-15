# Integrations

| Integration | State in this build |
|---|---|
| GoHighLevel (LeadConnector API, date versions 2021-07-28 / 2021-04-15) | Marketplace OAuth (or private token) per business. Two-direction sync with one owner per field: contacts and leads, opportunities, appointments, products and inventory, POS sales as CRM activity, online-order import. Durable outbox, verified webhooks, reconciliation and a monitoring screen. **Tested against a simulated API only; not yet verified against a live GoHighLevel sub-account.** |
| Public website | **Moved to GoHighLevel.** Archived in `customer-website-reference/`; this app no longer serves public pages. |
| Payments (cash, card, bank transfer, GCash, Maya, other) | **Recorded manually.** No payment gateway is connected. |
| Email | **Not integrated.** An adapter exists (`src/server/mail.ts`) but sends nothing. |
| SMS | Only indirectly, through a GoHighLevel workflow triggered by a tag. |
| File storage (expense receipts) | Local disk (`UPLOAD_DIR`). Needs an object-storage adapter on serverless hosts. |

---

## GoHighLevel

The Phase 1 contacts-only integration was replaced in Phase 2. See:

- [GHL_ARCHITECTURE.md](GHL_ARCHITECTURE.md): system split, field and event ownership, the sync engine, webhooks, reconciliation and monitoring.
- [GHL_API_CAPABILITY_MATRIX.md](GHL_API_CAPABILITY_MATRIX.md): what the GHL API supports, with confidence levels, and what we call.
- [GHL_SETUP_GUIDE.md](GHL_SETUP_GUIDE.md): marketplace app, environment variables, connecting a business, mapping, and the live verification checklist.
- [SYNC_TEST_PLAN.md](SYNC_TEST_PLAN.md): every scenario with its automated test, and live status.

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
