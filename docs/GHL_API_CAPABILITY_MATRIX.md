# GoHighLevel API capability matrix

What the GoHighLevel (HighLevel / LeadConnector) public API can and can't do for this integration, and which calls the code actually makes.

- **Researched:** 2026-10-15.
- **Sources:**
  - the official OpenAPI repo, https://github.com/GoHighLevel/highlevel-api-docs (specs in `apps/*.json` and `apps/v3/*.json`);
  - the live developer docs, https://marketplace.gohighlevel.com/docs/, including the Changelog up to 2026-10-06.
- **Where they disagree:** the live docs win.
- **Live verification: none.** The GHL QA connector was not connected during research or development, and no GoHighLevel credentials were available. Every row below is documentation-based. Nothing has been exercised against a real sub-account.

## Confidence labels

| Label | Meaning |
|---|---|
| **Docs** | Stated in the official spec or a live docs page. |
| **Docs (partial)** | The endpoint is documented, but a detail we depend on isn't (that detail is noted). |
| **Unconfirmed** | Not stated in any official source. The code treats it defensively. |
| **Not available** | Searched for and not found in any v2 or v3 spec, or in the docs index. |
| **Used** | The integration calls it (see `src/server/integrations/ghl/api.ts`). |

## API version

- **Base URL:** `https://services.leadconnectorhq.com`.
- **`Version` header:** the integration pins the date versions:
  - `2021-07-28` for most endpoints;
  - `2021-04-15` for calendars.
- **v3:** released 2026-06-11. Its differences include renamed OAuth helper paths, camelCase opportunity-search parameters, and removed list endpoints.
  - The date versions are still supported ("Supported Until: TBD"), but their docs are marked "no longer actively maintained".
  - **Before moving to v3**, re-check each used endpoint against the v3 pages. The v3 GitHub spec is older than the live docs (for example, `/oauth/token` field casing).

## Capability matrix

### Authentication and platform

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| Install (authorise) | `GET https://marketplace.gohighlevel.com/v2/oauth/chooselocation` | requested scopes | – | Docs | Used | White-label host: `marketplace.leadconnectorhq.com` (`GHL_MARKETPLACE_URL`). **Whether `state` is echoed back is unconfirmed** (see note 1). |
| Exchange code / refresh | `POST /oauth/token` (form-urlencoded, snake_case) | client credentials | W | Docs | Used | The access token lasts about 24 h. **Refresh tokens are single-use and rotate.** `user_type=Location`. |
| Agency → location token | `POST /oauth/locationToken` | `oauth.write` | W | Docs | No | Agency tokens are refused: one business = one sub-account. |
| Installed locations | `GET /oauth/installedLocations` | `oauth.readonly` | R | Docs | No | Agency only. |
| Webhooks (app-level URL) | set in Marketplace → app → Webhooks | per event | – | Docs | Used | Ed25519 `X-GHL-Signature` (current). RSA `X-WH-Signature` (legacy; announced end date 2026-09-01, current status unconfirmed). Up to 12 retries; circuit breaker after sustained failures. |
| Webhook registration API | – | – | – | Not available | – | Configured in the app dashboard only. |
| Get location | `GET /locations/{locationId}` | `locations.readonly` | R | Docs | Used | Verifies the sub-account at connect time; reads name and time zone. |
| Search users | `GET /users/search?companyId=&locationId=` | `users.readonly` | R | Docs | Used | Auto-maps staff by email. `GET /users/?locationId` is deprecated in 2021-07-28 and removed in v3, so it isn't used. |
| Custom fields | `GET /locations/{id}/customFields` | `locations/customFields.readonly` | R | Docs | No | Requested for future mapping. |
| Rate limits | `X-RateLimit-*` headers | – | – | Docs | Used | 100 requests per 10 s and 200,000 per day, per app per location. **The 429 status and `Retry-After` header are unconfirmed.** We honour both if present, otherwise pause 10 s. |

### Contacts

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| Get | `GET /contacts/{id}` | `contacts.readonly` | R | Docs | Used | Fetches a contact for an imported order or appointment. |
| Duplicate lookup | `GET /contacts/search/duplicate?locationId=&email=&number=` | `contacts.readonly` | R | Docs | Used | Follows the location's "allow duplicates" setting. Searched by email first, then by phone (7+ digits). |
| Search | `POST /contacts/search` | `contacts.readonly` | R | Docs (partial) | No | Body schema undocumented (it points to an external doc). |
| Create | `POST /contacts/` | `contacts.write` | W | Docs | Used | Only when no duplicate is found. |
| Update | `PUT /contacts/{id}` | `contacts.write` | W | Docs | Used | `tags` on PUT replaces all tags, so tags are never sent here. |
| Upsert | `POST /contacts/upsert` | `contacts.write` | W | Docs | No | Matching rules depend on location settings; explicit duplicate search is used instead. |
| Add / remove tags | `POST` / `DELETE /contacts/{id}/tags` | `contacts.write` | W | Docs | Used | Stage tags and the order-ready trigger tag. |
| Add note | `POST /contacts/{id}/notes` | `contacts.write` | W | Docs | Used | POS sale summary ("payment recorded at the shop, not processed by GoHighLevel Payments"). |
| Webhooks | ContactCreate, ContactUpdate, ContactTagUpdate, ContactDndUpdate, ContactDelete | `contacts.readonly` (some events unconfirmed) | – | Docs | Used | Payload has `dateUpdated`, used for out-of-order protection. |

### Opportunities

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| Pipelines | `GET /opportunities/pipelines?locationId=` | `opportunities.readonly` | R | Docs | Used | Mirrored for the sales pipeline and stage mapping. |
| Get | `GET /opportunities/{id}` | `opportunities.readonly` | R | Docs | Used | Re-read before applying a webhook (webhook payloads have no `updatedAt`). |
| Create | `POST /opportunities/` | `opportunities.write` | W | Docs | Used | Requires `pipelineId`, `locationId`, `name`, `status`, `contactId`. |
| Update | `PUT /opportunities/{id}` | `opportunities.write` | W | Docs | Used | **No ETag or version field.** A conflict is detected by comparing `updatedAt` after a fresh GET (best effort, not atomic). |
| Search | `GET` / `POST /opportunities/search` | `opportunities.readonly` | R | Docs (partial) | No | GET is deprecated in 2021-07-28 and its parameters are renamed in v3. POST filter syntax is undocumented. |
| Upsert | `POST /opportunities/upsert` | `opportunities.write` | W | Docs (partial) | No | Matching rule and `contactId` handling undocumented. |
| Webhooks | OpportunityCreate / Update / StageUpdate / StatusUpdate / MonetaryValueUpdate / AssignedToUpdate / Delete | `opportunities.readonly` | – | Docs | Used | No previous values and no `updatedAt` in the payload. |

### Calendars and appointments (`Version: 2021-04-15`)

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| List calendars | `GET /calendars/?locationId=` | `calendars.readonly` | R | Docs | Used | Mapped to branch and appointment type in Settings. |
| Get appointment | `GET /calendars/events/appointments/{eventId}` | `calendars/events.readonly` | R | Docs | Used | |
| List events | `GET /calendars/events?locationId=&calendarId=&startTime=&endTime=` | `calendars/events.readonly` | R | Docs | Used | Times are in epoch milliseconds. |
| Create appointment | `POST /calendars/events/appointments` | `calendars/events.write` | W | Docs | Used | Requires `calendarId`, `locationId`, `contactId`, `startTime`. We send `ignoreFreeSlotValidation: true` because the dashboard already validated the slot. |
| Update appointment | `PUT /calendars/events/appointments/{eventId}` | `calendars/events.write` | W | Docs | Used | |
| Free slots | `GET /calendars/{id}/free-slots` | `calendars.readonly` | R | Docs | No | Range of 31 days at most. |
| Webhooks | AppointmentCreate / Update / Delete | unconfirmed | – | Docs | Used | The docs' example payloads mislabel `type`, so the code branches on the received type. |

### Products, prices and inventory

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| Create / update product | `POST /products/`, `PUT /products/{id}` | `products.write` | W | Docs | Used | PUT requires `name`, `locationId` and `productType`, so the full object is sent. |
| List / create / update price | `GET` / `POST /products/{id}/price`, `PUT .../price/{priceId}` | `products/prices.*` | R/W | Docs | Used | **A price is GHL's variant/SKU unit.** One price per dashboard variant; `trackInventory`, `sku` and `availableQuantity` are set here. |
| List inventory | `GET /products/inventory?altId=&altType=location` | `products/prices.readonly` | R | Docs | Used | For reconciliation. |
| Set inventory | `POST /products/inventory` `{altId, altType, items:[{priceId, availableQuantity}]}` | `products/prices.write` | W | Docs | Used | **Absolute quantity only.** No increment, decrement or reservation endpoint, and no concurrency token. |
| Bulk edit | `POST /products/bulk-update/edit` | unconfirmed | W | Docs (partial) | No | Scope not stated. |
| Inventory webhook | – | – | – | Not available | – | No inventory event. Whether `PriceUpdate` fires on stock change is unconfirmed. |
| Product / price webhooks | ProductCreate…, PriceCreate… | unconfirmed | – | Docs | No | The dashboard owns the catalogue, so inbound catalogue edits aren't applied. |

### Payments (orders and transactions)

| Operation | Method and path | Scope | R/W | Confidence | Used | Notes and limits |
|---|---|---|---|---|---|---|
| List / get orders | `GET /payments/orders?altId=&altType=location`, `GET /payments/orders/{id}` | `payments/orders.readonly` | R | Docs | Used | Order `status` is a free string. The order schema has no `paymentStatus`, so payment state is read from transactions. |
| List transactions | `GET /payments/transactions?altId=&altType=location&entityId=` | `payments/transactions.readonly` | R | Docs | Used | Paid = sum of successful transactions; refunds = their `amountRefunded` (recorded as dashboard refunds). |
| Order webhooks | OrderCreate, OrderStatusUpdate | unconfirmed | – | Docs | Used | Triggers an import that re-reads the order and its transactions. |
| **Create order** | – | – | – | **Not available** | – | **POS sales cannot be written into GHL Payments.** |
| **Create / refund transaction** | – | – | – | **Not available** | – | Transactions are read-only. |
| Record payment on a GHL order | `POST /payments/orders/{orderId}/record-payment` | `payments/orders.collectPayment` | W | Docs | **No** | Exists, but only for orders that already exist in GHL. Using it for POS sales would misrepresent where the money was taken, so it's deliberately unused. |
| Invoices + record payment | `POST /invoices/`, `POST /invoices/{id}/record-payment` | `invoices.write` | W | Docs | No | Could mirror a POS sale as a paid invoice, but that creates real invoices and may fire workflows. Not used; see GHL_ARCHITECTURE.md. |

## Notes

1. **OAuth `state`:** GHL's docs don't say whether `state` is returned to the redirect URL.
   - We still send it. It is stored hashed and bound to the staff member, with a 15-minute expiry.
   - If GHL omits it, the callback falls back to that member's most recent pending state, so the callback only works for a signed-in member who started the flow.
   - Either way, the returned location must be the one the member is entitled to connect, and tokens for an agency (Company) are refused.
2. **Webhook signature input:** the docs' example verifies over `JSON.stringify(req.body)`. We verify the raw body first, then the re-serialised body.
3. **Replay window:** retries can arrive minutes or hours later (up to 12 retries). Deduplication relies on `webhookId`, plus a 72-hour staleness limit, rather than a 5-minute window.
4. **No optimistic concurrency** exists on contacts, opportunities, prices or appointments. Ownership rules (GHL_ARCHITECTURE.md) decide which side may write each field, so blind overwrites don't happen by design.

## What this means for the product

- A POS sale appears in GHL as **CRM activity**: a won opportunity in the chosen pipeline with the sale value, plus a contact note. It is **not** a GHL order or transaction, and the note says the payment was recorded at the shop.
- GHL online-store orders are **imported** into the dashboard (read-only on the GHL side). Stock is deducted once, on import.
- Stock is published to GHL as an **absolute quantity per price**. Because there's no compare-and-set, a GHL online sale and a POS sale moments apart can race. The dashboard stays authoritative, and reconciliation reports any drift; it never overwrites local stock.
