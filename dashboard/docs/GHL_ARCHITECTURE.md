# GoHighLevel integration: architecture

How the dashboard and GoHighLevel (GHL) divide the work, which system owns each piece of data, and how changes move between them reliably.

- **Code:** `src/server/integrations/ghl/`.
- **Status:** implemented and tested against a simulated GHL API (`tests/db/ghl-fake.ts`). **Not yet verified against a live sub-account.** See [SYNC_TEST_PLAN.md](SYNC_TEST_PLAN.md).

## 1. System split

| Owned by GoHighLevel | Owned by the dashboard (PostgreSQL is authoritative) |
|---|---|
| Public website and landing pages (moved from this app; see `customer-website-reference/`) | POS and checkout |
| Forms and lead capture | Products, variants, prices and costs |
| Online booking calendars (when *GHL calendars are authoritative* is chosen) | Inventory: on hand, reservations, movements, valuation |
| Marketing automation, SMS and email workflows | Purchase orders and receiving |
| CRM pipelines and conversations | Sales, payments, refunds, receivables |
| GHL online-store checkout (its orders are imported) | Customer orders and fulfilment |
| | Reports, staff, permissions and the audit trail |

**Rules that follow from this split:**

- PostgreSQL is the only source of truth for stock, money, fulfilment and audit. GHL holds copies or derived CRM records.
- **No field is written by both sides.** Each field has one owner (section 3). The other side only receives copies, so there is no uncontrolled two-way sync.
- **POS checkout never waits for GHL.** Outbound work is queued in the same transaction as the sale and delivered later. A GHL outage delays CRM updates; it never blocks a sale.
- A GHL opportunity is **pipeline value, not revenue**. Dashboard reports count only completed sales.

## 2. Flow overview

```
 Dashboard service (sale, stock change, lead…)
        │  same DB transaction
        ▼
 integration_sync_events  ◄──── webhooks (verified, deduplicated) ◄──── GoHighLevel
   (outbox + inbox)                                                        ▲
        │  worker: claim (SKIP LOCKED) → handler → GHL API → confirm         │
        └──────────────────────────────────────────────────────────────────┘
 Reconciliation (hourly): compares GHL with PostgreSQL and records mismatches.
 It never overwrites local stock or money.
```

**Workers run in three places, all through the same engine:**

1. `POST /api/integrations/ghl/process`, called by a scheduler every 1–5 minutes with `Authorization: Bearer $CRON_SECRET`. Adding `?reconcile=1` (hourly) also runs reconciliation.
2. Right after a staff action, using `after()`, so changes usually reach GHL within seconds.
3. Inline, when a webhook arrives.

Durability comes from the database rows, not from the request. If an in-request run is cut off, the scheduled worker finishes the job.

## 3. Field-level ownership

### Contacts, leads and customers

| Data | Owner | Dashboard → GHL | GHL → dashboard |
|---|---|---|---|
| Lead created in GHL (form, ad, import) | **GHL** | Stage tags only | Creates a lead (source *GoHighLevel*). Later contact updates overwrite that lead's name, email and phone. |
| Lead created in the dashboard | **Dashboard** | Contact created or linked (email, then phone duplicate search); identity fields and stage tag (`<prefix>-stage-<stage>`) | Mirror only. Inbound edits never overwrite what staff entered; empty fields may be filled. |
| Customer (any origin) | **Dashboard** | Contact identity (name, email, phone); the *order-ready* tag; sale notes | Mirror only. A customer record is never changed by GHL. |
| Consents (SMS / marketing) | **Dashboard** | – | Not imported. A public or anonymous submission can't switch consent on (it's logged for staff instead). |
| GHL contact id | Link table `ghl_contacts` | – | – |
| Contact deleted in GHL | – | – | Mirror marked deleted; the dashboard lead or customer is kept, with a note. |

**Echo suppression:** an inbound update arriving within 2 minutes of our own push to that contact is treated as an echo and doesn't overwrite anything.

### Opportunities

| Data | Owner | Notes |
|---|---|---|
| Opportunities created in GHL | **GHL** | Mirrored into `ghl_opportunities` for the pipeline view. Never counted as revenue. |
| Opportunity for a dashboard sale or order | **Dashboard** owns name, value and status | One opportunity per sale, in the chosen *sales pipeline*: `won` when completed (value = total − refunds), `lost` when cancelled or fully refunded, `open` for orders in progress. |
| Stage of a sale's opportunity | Dashboard sets it on its own stage changes | If someone moves the stage by hand in GHL, that's respected until the sale's own stage changes (tracked with `last_pushed`). |
| Staff edits to a GHL opportunity from the dashboard | GHL is re-read first | Refused with a conflict message if GHL's `updatedAt` is newer than our copy (no ETag exists, so this is best-effort, not atomic). |

### Appointments (setting: *appointments system of record*)

| Mode | Behaviour |
|---|---|
| `platform` (default) | The dashboard calendar is authoritative. Dashboard bookings are not pushed. Bookings made in GHL calendars are still mirrored in, if the calendar is mapped. |
| `ghl` | GHL calendars are authoritative. A dashboard booking or change is saved locally as **pending** (`sync_state`) and pushed. It shows **synced** only after GHL confirms, and **failed** (with the reason) if GHL refuses. GHL-side changes are applied in order (`dateUpdated`); deletes become cancellations. |

**In both modes:**

- Calendars must be mapped to a branch and appointment type. An unmapped calendar sends the event to *Needs review*.
- A GHL booking that overlaps an existing practitioner booking is saved without the practitioner and flagged for review. The database exclusion constraint is never bypassed.

### Products, prices and inventory

| Data | Owner | Notes |
|---|---|---|
| Product name, description, type | **Dashboard** | One GHL product per dashboard product (made-to-order products are skipped). |
| Variant price, SKU | **Dashboard** | One GHL *price* per variant (a GHL price is its SKU unit). Amounts are sent in major units. A content hash skips no-op pushes. |
| Available quantity | **Dashboard** | Pushed as an **absolute** number (on hand − reserved, at the published stockroom) after every stock or reservation change. Coalesced, so a burst of sales sends the latest value once. |
| GHL catalogue edits | – | Not imported (no two-way catalogue sync). |
| GHL quantity drift | – | Reconciliation records an *inventory mismatch*. Staff choose *push dashboard value* or *ignore*. Local stock is never overwritten from GHL. |

### Sales and payments

| Data | Owner | Notes |
|---|---|---|
| POS sales, payments, refunds | **Dashboard** | GHL gets CRM activity only: the opportunity above, plus a one-time contact note ("payment recorded at the shop's POS, not processed by GoHighLevel Payments"). **No GHL order, transaction or invoice is created**: there's no order-create API, and `record-payment` is only for orders that already exist in GHL. |
| GHL online-store orders | **GHL** is the source of the order; the **dashboard** owns its stock and revenue effect | Imported once (unique `sales.external_ghl_order_id`) as a completed sale with channel `ghl_online` and payment method *GoHighLevel online*. Paid = successful GHL transactions. Unpaid and test-mode orders are skipped until paid. |
| Stock for online orders | **Dashboard** | Deducted **once, at import**: never from the order event and the payment event separately. Lines that would oversell are recorded but not deducted, and flagged. |
| Refunds of online orders | GHL | Re-import records a revenue refund for the newly refunded amount and opens a *restock review* item. Stock isn't returned automatically, because the goods may not come back. |
| Unlinked online items | – | The order waits in *Needs review* until each GHL price is linked to a variant. |

## 4. Events and handlers

| Trigger (dashboard service) | Event | Handler → GHL calls | Done when |
|---|---|---|---|
| Lead created or edited, stage change, conversion | `lead.upsert` | duplicate search → create or update contact → add/remove stage tags | GHL returns the contact |
| Customer created or edited | `customer.upsert` | same, identity only | GHL returns the contact |
| Order marked *Ready for pickup* (SMS consent only) | `order.ready` | remove then add the order-ready tag | tag call succeeds |
| Sale or order created, paid, progressed, refunded or cancelled | `sale.sync` | ensure contact → create or update opportunity → note (first time) | GHL returns the opportunity |
| Product created, edited or archived | `product.sync` | create or update product → create or update prices | GHL returns ids |
| Stock or reservation change at the published stockroom | `inventory.push` | `POST /products/inventory` (absolute) | GHL returns success |
| Dashboard appointment (authority = ghl) | `appointment.push` | create or update appointment | GHL returns the event id |
| Connect, or *Refresh GHL data* | `system.refresh_metadata` | location, pipelines, calendars, users | all four read |
| Webhook ContactCreate / Update / TagUpdate / DndUpdate / Delete | `ghl.Contact*` | none (payload) | dashboard updated |
| Webhook Opportunity* | `ghl.Opportunity*` | `GET /opportunities/{id}` (fresh state) | mirror updated |
| Webhook Appointment* | `ghl.Appointment*` | none (payload) | dashboard updated |
| Webhook OrderCreate / OrderStatusUpdate; reconciliation | `order.import` | `GET` order + transactions (+ contact) | sale imported, or skipped with a reason |
| Workflow webhook (GHL workflow "Webhook" action) | `ghl.ContactUpdate` | none | lead created or linked |

Every handler returns one of: `synced`, `skipped` (with a reason, e.g. "walk-in sale without a customer"), `needs_review` (a person must act), or throws a typed error that the engine turns into a retry or a failure.

## 5. The sync engine (`engine.ts`)

### Statuses

| Status | Meaning |
|---|---|
| **Pending** | Queued, not yet attempted. |
| **Processing** | Claimed by a worker (row lease: `locked_at`, `locked_by`). |
| **Synced** | GHL confirmed the operation. This is the only success state, set only after a 2xx response, which the handler checks. |
| **Retry scheduled** | A transient failure (network, timeout, 5xx, 429). `next_attempt_at` is set with backoff. |
| **Failed** | Gave up: permanent error (4xx validation), or 8 attempts exhausted (dead letter). Retried only by a person. |
| **Needs review** | A person must decide: missing scope, unmapped calendar or item, contact conflict, missing pipeline. *Retry* re-queues it after the fix; *Dismiss* closes it. |
| **Skipped** | Intentionally not sent, with the reason recorded. |

### Guarantees and how they're met

- **No lost or phantom events (transactional outbox).** Events are inserted in the same transaction as the business change. A rolled-back sale enqueues nothing.
- **No duplicate sends.**
  - Workers claim with `FOR UPDATE SKIP LOCKED`.
  - State-based events (`inventory.push`, `sale.sync`, …) are **coalesced**: at most one pending row per record, and the handler reads the current state when it runs, so a stale value is never pushed.
  - Inbound events carry an idempotency key (`wh:<webhookId>`, `wf:<event id or body hash>`, `reconcile-order:<id>:<updatedAt>`) under a unique index.
- **Retries.**
  - Exponential backoff: 30 s × 2ⁿ ± 20 % jitter, capped at 6 h, up to 8 attempts.
  - A 401 triggers one token refresh and retry in the client.
  - A 403 or missing scope goes to *Needs review*.
- **Rate limits.** On a 429 the business is paused until `Retry-After`, or the rate-limit window, has passed (`rate_limited_until`). The rest of the batch is deferred without using up attempts.
- **Crash recovery.** A lease older than 10 minutes is returned to the queue (`recoverStaleLeases`).
- **Per-business isolation.** The worker processes each business separately, with its own token, rate-limit pause and error handling. One failing sub-account never blocks another.
- **Handlers run outside DB transactions**, so no lock is held during a network call. Results are written back afterwards.
- **Audit.** Connect, disconnect, settings changes, manual retries, dismissals and mismatch resolutions are written to the audit log.

## 6. Connecting businesses (multi-tenant OAuth)

- **One marketplace app, many businesses.** Each business connects **one** GHL sub-account. A sub-account can be connected to only one business: a partial unique index on `(provider, external_account_id)` covers connections that aren't disabled.
- **Connect (OAuth):**
  1. *Settings → Integrations → GoHighLevel → Connect* creates a random `state`, stored as a SHA-256 hash, bound to the staff member and business, with a 15-minute expiry.
  2. The member is redirected to GHL's location chooser with the scopes in `constants.ts`.
  3. The callback exchanges the code server-side, refuses Company (agency) tokens, verifies the location with `GET /locations/{id}`, and stores the tokens.
- **Connect (private integration token):** an alternative for a single business. The token is verified against the location before it's saved.
- **Token storage.** Access and refresh tokens are encrypted with AES-256-GCM using a key derived from `APP_SECRET`. They are never sent to the browser, logged, or included in API responses. Logs pass through `redact()`.
- **Refresh.** Refresh tokens are single-use and rotate. A refresh locks the connection row (`SELECT … FOR UPDATE`). If another worker already refreshed, its fresh token is reused. A revoked refresh token sets *Reconnect required*: queued work stays queued (nothing is lost), and resumes after reconnecting.
- **Disconnect** deletes the stored credentials and webhook secret, and stops queued work.
  - *Disconnect and forget* also clears GHL mirrors and links.
  - It never deletes dashboard customers, leads, sales or stock.
- **Uninstall.** An `UNINSTALL` webhook disables the connection in the same way.
- **Reconnect** re-runs OAuth. The same location reuses its links. A different location for the same business is refused unless the old one was disconnected with *forget*, so data from two sub-accounts never mixes.

## 7. Webhooks

| Endpoint | Used for | Authentication |
|---|---|---|
| `POST /api/integrations/ghl/webhooks` | Marketplace app events (all businesses) | Ed25519 `X-GHL-Signature` over the raw body (then the re-serialised body); legacy RSA `X-WH-Signature` as fallback. Routed by `locationId` to exactly one business. |
| `POST /api/integrations/ghl/webhook/<business-slug>` | GHL workflow "Webhook" action (forms → dashboard lead) | `x-webhook-secret` per business, compared in constant time; rejected once disconnected. |

**Both endpoints:**

- Cap the body at 256 KB while reading.
- Ignore events older than 72 hours.
- Deduplicate deliveries.
- Return 200 quickly, after queueing the event and processing it inline.
- Unknown locations and unused event types return 200 with `ignored`, so GHL doesn't retry them forever.

## 8. Reconciliation and checks (`reconcile.ts`)

These run hourly (`?reconcile=1`) or from *Run reconciliation*. Each check is deterministic: rules, not AI.

| Check | What it compares | Result |
|---|---|---|
| Inventory | Dashboard available vs `GET /products/inventory` for every linked price | *Inventory mismatch* (or *missing in GHL*). Resolve by pushing the dashboard value or ignoring. Auto-closes when the values agree again. |
| Online orders (14 days) | GHL orders vs imported sales | Queues imports for missed or updated orders (missed webhooks, refunds). |
| Duplicates | Customers sharing an email or phone (7+ digits) | *Duplicate customer* finding, so contact sync stays one-to-one. |
| Contact conflicts | A GHL contact matching two dashboard records | The event goes to *Needs review*. Nothing is merged automatically. |
| Stale data | Inbound events older than what's stored (`dateUpdated`); webhooks older than 72 h | Skipped, with the reason. |
| Stalled sync | Queued work older than 30 min; leases abandoned for more than 10 min | Warning on the monitoring screen; reported by `/api/health` (with the cron bearer). |

## 9. Data model

| Table | Purpose |
|---|---|
| `integration_connections` | One row per business and provider: status, auth type, location, encrypted tokens and expiry, scopes, settings (sync switches, pipeline/stage map, published stockroom, online branch), rate-limit pause, last success and last error. |
| `integration_sync_events` | Outbox and inbox: direction, category, event type, entity, external id, idempotency key, status, attempts, last error and HTTP status, result, next attempt, lease, review info. |
| `oauth_states` | Hashed OAuth state, bound to a member, with expiry. |
| `ghl_contacts`, `ghl_opportunities`, `ghl_pipelines`, `ghl_calendars`, `ghl_users`, `ghl_product_links` | Mirrors and links (GHL id ↔ dashboard id), with GHL timestamps for ordering. |
| `integration_mismatches` | Reconciliation findings (open, resolved or ignored), one open row per issue. |
| Columns on core tables | `appointments.sync_state`, `ghl_calendar_id`; `sales.channel`, `external_ghl_order_id` (unique), `external_ghl_status`; `payment_method` value `ghl_online`. |

## 10. Monitoring screen

*Settings → Integrations → GoHighLevel*. This uses the existing dashboard design system, and is visible only to members with `integrations.manage`.

- **Overview:** connection status, sub-account name and id, auth type, token expiry (never the token itself), last successful sync, last error, rate-limit pause. Actions: Connect GoHighLevel, Reconnect, Disconnect, Sync now, Run reconciliation, Refresh GHL data.
- **Per-area tiles** (contacts, opportunities, appointments, products, inventory, sales, orders): queued, needing attention, last confirmed sync, plus the stalled-sync warning.
- **Needs attention:** failed and needs-review events with their errors. Retry (single or all) or dismiss.
- **Findings:** open reconciliation mismatches, with resolve actions.
- **Mapping:** sales pipeline and stages, calendars → branch and type, GHL users → staff, published stockroom, online-order branch, sync switches, tag prefix.
- **Log:** filterable event history (status, category), with attempts and errors.
- **Endpoints:** webhook URLs, the workflow-webhook secret (revealed on demand to managers of integrations), and the OAuth redirect URL to register.

## 11. Decisions and rejected alternatives

- **POS sales are not written as GHL orders, invoices or payments.**
  - There's no public order-create endpoint.
  - `record-payment` applies only to orders that already exist in GHL.
  - Creating paid invoices would create real invoices, consume numbering and may fire workflows.
  - A won opportunity plus a clearly labelled note gives GHL the CRM signal without misstating where money was taken.
- **No two-way catalogue or stock sync.** GHL inventory has no delta operation and no concurrency token, so letting both sides write would lose updates. The dashboard writes and GHL is a published copy. Drift is detected, never auto-overwritten.
- **Date-versioned API (2021-07-28 / 2021-04-15), not v3.** These match the specs the code was written against, and they are still supported. Migrating to v3 is a planned, separately tested change (see the capability matrix).
- **No AI or LLM involvement.** Matching, conflict handling and reconciliation are explicit rules.
