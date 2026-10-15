# Project status (2026-10-15)

**Summary.** Every module in the brief is built on a real backend: PostgreSQL, server-side permissions, tenant isolation, and transactional stock and money handling. All five connected workflows (A–E) are tested end-to-end through the UI. Lint, typecheck, 101 unit/database/component tests, 19 end-to-end tests and the production build all pass.

It is **not production-ready yet**. Before taking real customers' money and records, see *Before going live* below: GoHighLevel hasn't been verified against a live account, email isn't integrated, receipt storage is local disk only, and the receipts and legal pages need a compliance review.

## Verification

All commands were run on 2026-10-15 against PostgreSQL 18, Node 24 and Windows 11.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | Pass, 0 problems |
| Types | `npm run typecheck` | Pass |
| Unit tests (money, pricing, tax, dates) | `npx vitest run --project unit` | 12 / 12 pass |
| Service tests on real PostgreSQL | `npx vitest run --project db` | 72 / 72 pass |
| Component tests (jsdom) | `npx vitest run --project components` | 17 / 17 pass |
| Production build | `npm run build` | Pass, 51 routes |
| End-to-end, production build | `E2E_BASE_URL=http://localhost:3100 npm run test:e2e` | 19 / 19 pass |
| End-to-end, dev server | `npm run test:e2e` | 19 / 19 pass |
| Demo data reconciliation | `npm run db:reset-demo` | 7 integrity checks pass |

What the database tests prove, rather than assume:

- **Concurrency.** Two simultaneous checkouts for the last unit result in one sale and no negative stock. Concurrent retries with the same idempotency key produce one sale and one deduction. Concurrent lead conversions produce one customer. Concurrent bookings of one practitioner are blocked by the database.
- **Tenant isolation.** Lists and lookups never return another business's rows. Writes that reference another business's records are rejected, including by the composite foreign keys if application checks were bypassed.
- **Permissions.** Each role's limits are enforced in the service layer, with per-member overrides and a guarantee that the last owner can't be removed.
- **Money and stock.** Server-side pricing (VAT inclusive and exclusive), discount limits, partial payments, voids, refunds with restock or damage, deposit handling, reservation then consumption at handover, and weighted-average cost.
- **Reports.** Gross, discounts, refunds, net, COGS, profit, receivables and cash each match records summed independently in the test.
- **Auth.** Sign-in, throttling, password reset, password change (other devices signed out), and immediate loss of access when deactivated.
- **GoHighLevel and onboarding.** See below.

## Modules

| Area | What works |
|---|---|
| **Public website** | Home, Eyewear (category filter and product pages), Services, Book, Contact, About, FAQ (with FAQ structured data), Privacy, Terms. All content comes from Settings and the catalogue. Lead capture with interest, preferred branch and consents, plus honeypot, rate limit and de-duplication. Real-availability online booking. Mobile layout. Sitemap and robots. Demo businesses are `noindex`. |
| **Dashboard and Analytics** | 14 KPIs with period comparison, branch and date filters (presets and a custom range), revenue and profit trends, lead funnel and sources, customer growth, appointment performance, order fulfilment, inventory health, top products, sales by staff. All of it comes from the database. |
| **POS** | Variant search and barcode entry, stock-aware cart, VAT, order discount with staff limit, customer link or create, split and partial payments (cash, card, bank, GCash, Maya, other, recorded manually), change due, idempotent checkout, receipts. |
| **Transactions** | Sale detail, record and void payments, refunds and returns (restock or damaged), cancellation, printable receipts. No financial record is ever deleted. |
| **Orders** | Deposit, prescription link, lab and reference, due date, six fulfilment stages, reservation at confirmation and consumption at handover, ready-for-pickup notification hook, payment status kept separate from fulfilment. |
| **Payments** | Ledger and outstanding balances. |
| **Leads, CRM pipeline** | List and filters, drag-and-drop board, notes and calls, follow-ups, assignment (sales staff see only their own leads), duplicate check, conversion that preserves history. |
| **Customers** | Profile, history (sales, payments, appointments), balance, lifetime value, prescriptions restricted to clinical and authorised roles, CSV export. |
| **Appointments** | Day, week, month and list views, real slot finder, booking for customers, leads or guests, reschedule, statuses, no practitioner overlap enforced by the database, business hours and time zone. |
| **Inventory** | Products and variants (stocked, service, made-to-order), opening stock, adjustments with reason, transfers, damage, movement history, reservations, valuation, low-stock alerts, CSV import and export. |
| **Purchasing** | Suppliers, purchase orders (draft, confirm by manager, partial or full receiving, close short, cancel), weighted-average cost. |
| **Expenses and Reports** | Expenses with receipt attachments; operational P&L, cash collected, receivables and ageing, breakdowns, CSV export. Metrics are defined in ARCHITECTURE.md and labelled as estimates. |
| **Staff and security** | Owner, Manager, Sales, Inventory and Practitioner roles, plus per-member permission overrides; temporary passwords; deactivation; activity (audit) log; account page with password change. |
| **Settings** | Branding (colours carry through the dashboard and the website), currency and tax, hours, branches, appointment types, website copy and FAQs, integrations, demo reset (demo only). |
| **Onboarding** | `npm run setup:business` creates a real business and its owner. There is no public sign-up. |

## Connected workflows (brief §18)

| Workflow | End-to-end test (UI only) | What it checks |
|---|---|---|
| A. Lead to customer | `workflows.spec.ts` › Workflow A | Website form → lead in CRM → stage change → appointment booked from the lead → "Appointment scheduled" → conversion → customer page shows the appointment → lead timeline kept |
| B. Inventory to sale | › Workflows B + E | New product → received through a PO → on hand 0 → 5 → shown in POS → sold to a customer → sale on the customer's history → on hand 4 with a *Sale* movement → today's gross sales up by exactly the sale amount |
| C. Customer order | › Workflow C | Order with 50% deposit → stocked item reserved → processing → lab → ready (history records "no customer message sent (messaging not configured)") → balance paid → handed over |
| D. Payment tracking | › Workflow D | Partial payment at POS → second payment (Maya with reference) → final payment (cash) → *Paid*; payments visible on the sale and in the ledger |
| E. Stock receiving | › Workflows B + E, plus `operations.spec.ts` | Draft PO (inventory role) → confirmed by a manager → received → stock and movement history updated → PO status *Received* |

## Database

PostgreSQL 15+ with about 35 tables. Migrations are in `drizzle/` (0000–0004). Integrity is enforced in the database where it matters:

- `CHECK` constraints keep stock non-negative and reserved ≤ on hand, with money stored in integer minor units.
- Composite foreign keys enforce tenant isolation.
- A `btree_gist` exclusion constraint prevents practitioner double-booking.
- Partial unique indexes back idempotency keys and payment references.

A bundled PostgreSQL server (`npm run db:start`) is used for local work and tests, so Docker isn't needed. The demo holds 644 customers, 103 leads, 104 variants and about 2,850 sales, 400 orders and 1,200 appointments over 9 months, all created through the real services.

## Integrations

| Integration | Status |
|---|---|
| GoHighLevel | **Available, off by default.** Encrypted credentials. Status stays *Not configured* until the connection test passes. Outbox delivery with retries. Signed and idempotent inbound webhook with loop prevention. 13 tests against a mocked API. **Not verified against a live sub-account.** Opportunity and calendar sync are not implemented. Details in INTEGRATIONS.md. |
| Payment gateway | **None.** Payments are recorded manually, and the UI says so. |
| Email | **Not configured.** Password reset tells users to ask an owner for a temporary password. |
| SMS | Only through a GHL workflow on the *order-ready* tag (customers with SMS consent). |

## Bugs found and fixed during final verification

- **Online and staff booking.** For a type that doesn't need a practitioner, the form pre-selected one but offered slots without checking their bookings, so a "free" time could be rejected on save. Slot finding now always honours the chosen practitioner. A regression test was added.
- **Reports.** The change badge for a negative operating profit could show "↑" in green when the loss grew. The change is now computed on the signed value, and tax shows as neutral.
- **Analytics.** The gross profit chart was labelled "Net sales" and had no previous-period comparison. Both are fixed.
- **Order on-time rate.** It measured the customer's pickup date. It now uses `ready_at` (new column, backfilled from the audit history), shown as "ready by due date".
- **Webhook.** The event record and its effects are now written in one transaction, so a failed delivery is retried instead of being treated as a duplicate. Oversized bodies are rejected before they are read.
- **Accessibility.** Some money fields weren't linked to their labels. The `Field` component now links its label to its control automatically.
- **Honesty of copy.** The forgot-password message no longer claims an email is on its way when none can be sent.
- **Missing features.** There was no way to create a real (non-demo) business, and staff couldn't change their own password. Both are added and tested.

## Before going live (outstanding)

1. **GoHighLevel:** connect a test sub-account, run the connection test, and confirm a lead arrives with its stage tag and an inbound webhook creates a lead.
2. **Email:** implement a provider in `src/server/mail.ts` (reset links, optionally receipts).
3. **File storage:** replace local-disk receipt storage with object storage if hosting is serverless or multi-instance.
4. **Compliance:** receipts are operational documents, not BIR-accredited official receipts or invoices. Have the privacy notice and terms reviewed for the business's jurisdiction (e.g. the Philippine Data Privacy Act); the shipped text is a plain-language starting point. Prescriptions are access-restricted but not encrypted at field level.
5. **Abuse limits:** the public-form rate limit is per instance and in memory. Login throttling is per email, which lets someone lock out a known account for 15 minutes. Add edge or WAF rate limiting.
6. **Operations:** backups and point-in-time recovery from the database host, error monitoring, a load test at expected volume, and an external security review.

## Known limitations (by design in this version)

- One public website per deployment (`SITE_BUSINESS_SLUG`); no custom-domain routing per business.
- A user who belongs to several businesses signs into their first active membership; there's no business switcher yet.
- One currency per business. Reports are operational, not accounting statements.
- Product images are chosen from the bundled illustrations or set by URL; there's no image upload.
- No appointment reminders are sent except through a GHL workflow.
- Design research: STOCKPOS (primary) and INVENZO were inspected. **Inventra could not be accessed (HTTP 403)** and was not used. See DESIGN.md.
