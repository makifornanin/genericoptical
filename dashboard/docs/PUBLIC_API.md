# Public website API (v1)

Business data, inquiry intake and **website orders** (a demo store: pickup only, online payments simulated) for the **customer website**, a separate Vercel project. The website calls this API **from its server only**: Next.js server components and route handlers. Browsers never call it, and it sends no permissive CORS headers.

- **Base path:** `/api/public/v1`.
- **Implementation:** `src/app/api/public/v1/**`, `src/server/services/public-api.ts`.

## Authentication and business isolation

- **Header:** every request sends `Authorization: Bearer <site key>`.
- **What a key is:**
  - Site keys are per business and stored only as a SHA-256 hash (table `api_keys`).
  - Each key carries scopes: `site:read`, `catalog:read`, `inquiries:write`, `orders:read`, `orders:write`. New keys get all five. A key created before Phase 6 has only the first three and can't place orders until it is replaced.
  - A revoked key stops working immediately.
- **Creating a key:** in the dashboard, **Settings → Website → Website API keys → New key** (owners and managers with *Manage integrations*). The key is shown once; paste it into the website's `DASHBOARD_SITE_KEY`. CLI alternative: `npm run site-key -- create --business <slug> --name "Customer website"`.
- **Revoking a key:** the same Settings card, or `npm run site-key -- revoke <prefix>`. `npm run site-key -- list --business <slug>` shows keys and when they were last used.
- **Website configuration:** `DASHBOARD_API_URL` is the dashboard's origin (e.g. `https://optical-management-dashboard.vercel.app`). The website adds `/api/public/v1` itself.
- **Business isolation:** the key decides the business. Requests can't name another business, and every query is filtered by the key's `business_id`.
- **Data exposure:** only intentionally public data is returned:
  - business profile, website copy, active branches and hours, public appointment types;
  - products marked **Show in online store**;
  - coarse availability.
  - Never returned: costs, exact stock counts, suppliers, staff or customer data.

## Rate limits

Durable, in PostgreSQL, so they hold across serverless instances.

| Scope | Limit |
|---|---|
| Reads per key | 600 per minute |
| Inquiries per key | 120 per hour |
| Inquiries per visitor IP | 8 per 10 minutes. The website server forwards the visitor's IP in `X-Client-IP`; it is trusted only on authenticated requests. |
| Cart quotes per key | 600 per minute |
| Orders per key / per visitor IP | 300 per hour / 10 per 10 minutes |
| Order lookups per key / per visitor IP | 600 per hour / 12 per 10 minutes |
| Order reads / cancels per key | 600 per minute / 120 per hour |

Exceeding a limit returns **429** with `Retry-After`.

## Caching

- **Read responses:** `Cache-Control: private, max-age=0, s-maxage=30, stale-while-revalidate=60`. `private` because they're keyed by the authorization header.
- **The website's own caching:**
  - responses cached for **60 seconds** (`next: { revalidate: 60 }`), tagged `site` / `catalog`;
  - an on-demand revalidation route on the website: `POST /api/revalidate`, `Authorization: Bearer <REVALIDATE_SECRET>`, body `{"tags":["site","catalog"]}`. The dashboard calls it after product, category, branch, hours, website-content, appointment-type and calendar-mapping changes when `WEBSITE_REVALIDATE_URL` / `WEBSITE_REVALIDATE_SECRET` are set.
- **Stock changes** from sales are not pushed. They reach the website within the 60-second window. Verified locally: a POS sell-out appeared on the product page without any revalidation call.

## Endpoints

### `GET /site` (scope `site:read`)

```jsonc
{
  "business": {
    "name": "Lensmere Optical", "legalName": "…", "tagline": "…", "description": "…",
    "logoUrl": "https://…|null", "phone": "…", "email": "…", "address": "2F … , Makati City|null",
    "website": "…|null", "timezone": "Asia/Manila", "currency": "PHP", "locale": "en-PH",
    "taxName": "VAT", "pricesIncludeTax": true, "brandColor": "#1F2B22", "accentColor": "#B5E14A",
    "isDemo": true
  },
  "content": {                                   // Settings → Website in the dashboard
    "heroEyebrow": "…|null", "heroTitle": "…|null", "heroBody": "…|null",
    "aboutTitle": "…|null", "aboutBody": "…|null",
    "values": [{ "title": "…", "body": "…" }],
    "faqs": [{ "question": "…", "answer": "…" }],
    "privacyContactEmail": "…|null"
  },
  "branches": [{
    "id": "uuid", "code": "MKT", "name": "Makati",
    "address": ["2F Linden Arcade, 118 Lumen Street", "Makati City"],
    "phone": "…|null", "email": "…|null", "mapUrl": "…|null", "imageUrl": "…|null",
    "hours": { "mon": { "open": "10:00", "close": "19:00" }, "sun": null /* closed */ }
  }],
  "services": [{                                  // public, active appointment types
    "id": "uuid", "code": "eye_exam", "name": "Comprehensive eye exam", "description": "…|null",
    "durationMinutes": 45, "priceCents": 50000 /* or null = price on request */,
    "calendars": [{ "branchId": "uuid", "calendarId": "GHL calendar id" }]   // from the dashboard's GHL mapping; [] until mapped
  }],
  "inBranchServices": [{                          // published service-type and lens products (price list)
    "id": "uuid", "name": "…", "description": "…|null", "priceCents": 120000, "fromPrice": true
  }],
  "categories": [{ "slug": "frames", "name": "Frames", "kind": "frames", "productCount": 20 }],
  "booking": { "widgetBase": "https://api.leadconnectorhq.com/widget/booking/", "ghlConnected": false },
  "ordering": {                                   // Settings → Website → Website orders; on by default for a demo business
    "enabled": true, "fulfilment": ["pickup"], "paymentOptions": ["demo_card", "pay_at_pickup"], "demoPayments": true
  },
  "generatedAt": "ISO"
}
```

### `GET /products?category=<slug>&q=<text>` (scope `catalog:read`)

```jsonc
{ "products": [ProductSummary], "generatedAt": "ISO" }
```

`ProductSummary`:

```jsonc
{
  "id": "uuid", "slug": "arden-101", "name": "Arden 101", "brand": "Arden|null",
  "category": { "slug": "frames", "name": "Frames", "kind": "frames" },
  "description": "…|null",
  "imageUrl": "https://dashboard/products/frame-rectangle-black.svg|null",   // absolute
  "priceFromCents": 295000, "priceToCents": 315000, "variantCount": 4,
  "availability": "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "service",
  "updatedAt": "ISO"
}
```

### `GET /products/<slug>` (scope `catalog:read`)

Returns `200 { "product": ProductDetail }` or `404 { "error": "Not found" }`.

`ProductDetail` = `ProductSummary` plus:

```jsonc
{
  "attributes": { "shape": "rectangle", "material": "acetate" },
  "variants": [{
    "id": "uuid", "label": "52 · Black", "options": { "size": "52", "colour": "Black" },
    "priceCents": 295000, "sku": "ARD-101-52-BK",
    "availability": "in_stock|low_stock|out_of_stock|made_to_order|service",
    "branches": [{ "branchId": "uuid", "branchName": "Makati", "availability": "in_stock|low_stock|out_of_stock" }]   // every active branch; [] for made-to-order
  }],
  "related": [ProductSummary]   // up to 4 from the same category
}
```

**Availability is computed from PostgreSQL** at request time:
- available = on hand − reserved, summed over active branches;
- `out_of_stock` when 0;
- `low_stock` when at or below the variant's reorder point (minimum 2);
- otherwise `in_stock`;
- `made_to_order` and `service` product types never show stock.

**Exact counts are never returned.**

### `POST /inquiries` (scope `inquiries:write`)

Request body (JSON, validated with zod):

```jsonc
{
  "fullName": "…",                 // required, ≤120
  "email": "…|null", "phone": "…|null",   // at least one; phone needs ≥7 digits
  "interest": "eye_exam|prescription_glasses|contact_lenses|sunglasses|frames|repair|other",
  "preferredBranchId": "uuid|null",
  "message": "…|null",             // ≤2000
  "smsConsent": false, "marketingConsent": false,
  "kind": "contact|product_inquiry|appointment_request",
  "productName": "…|null",
  "sourcePage": "/eyewear/arden-101|null",
  "website": ""                    // honeypot: must stay empty
}
```

Response: `201 { "ok": true }`, or `400 { "error", "fieldErrors" }`, `401`, `429`.

**Never** reveals whether the person already existed.

**Effect:**
1. A lead is created in the dashboard (source *website*), or the inquiry is added to the same person's open lead from the last 30 days.
2. Consent is never escalated by an anonymous form.
3. The GHL integration queues `lead.upsert`. GHL searches for an existing contact (email, then phone) before creating one, so contacts aren't duplicated, and tags the stage.
4. The lead is shown in GHL with source "Website".

## Website orders (demo store)

The customer website sells for **pickup at a branch**. There's no delivery and no real payment: the "card" option is a simulated payment, recorded as *Online card (demo — not charged)*. Implementation: `src/server/services/website-orders.ts`, table `website_orders` (migration `0013`).

The owner can switch ordering on or off in **Settings → Website → Website orders**. It is on by default for a demo business and off for a real one. When it is off, `GET /site` returns `ordering.enabled: false`, and `POST /orders` returns `403`.

### `GET /lenses` (scope `catalog:read`)

Published prescription lenses: products in an `rx_lenses` category, made to order, shown online.

```jsonc
{ "lenses": [{ "variantId": "uuid", "productId": "uuid", "name": "Progressive · blue-light filter", "description": "…|null",
               "priceCents": 650000, "type": "single_vision|progressive|bifocal", "features": ["blue_light", "thin", "photochromic"] }],
  "generatedAt": "ISO" }
```

`type` and `features` are read from the product's name and its `lensType` attribute.

### `POST /cart/quote` (scope `catalog:read`)

Prices a bag from the live catalogue and says which branches can fulfil it.

```jsonc
// request
{ "items": [{ "variantId": "uuid", "quantity": 1, "lensVariantId": "uuid|null" }] }
// response
{ "currency": "PHP", "pricesIncludeTax": true, "subtotalCents": 0, "taxCents": 0, "totalCents": 0,
  "lines": [{ "variantId": "uuid", "name": "…", "variantLabel": "…", "productType": "stock|made_to_order", "quantity": 1, "unitPriceCents": 0, "lineTotalCents": 0 }],
  "branches": [{ "branchId": "uuid", "name": "Makati", "code": "MKT", "canFulfil": true, "unavailableVariantIds": [] }],
  "generatedAt": "ISO" }
```

- **What can be sold:** only published, active variants. Lenses go only with a frame, never on their own. Services can't be ordered.
- **Stock:** `canFulfil` compares available stock (on hand minus reservations) at each branch with the quantities in the bag. Counts are never returned.

### `POST /orders` (scope `orders:write`) → `201`

```jsonc
{
  "idempotencyKey": "8–100 chars [A-Za-z0-9-]",   // one per checkout attempt
  "branchId": "uuid",                              // pickup branch
  "customer": { "fullName": "…", "email": "…", "phone": "…" },   // all required
  "items": [{
    "variantId": "uuid", "quantity": 1, "lensVariantId": "uuid|null",
    "prescription": {                              // required when lensVariantId is set
      "mode": "enter|send_later|on_file|book_exam",
      "od": { "sph": "-1.25", "cyl": "-0.50|null", "axis": "90|null", "add": "+1.50|null" }, "os": { … },
      "pd": "63|null", "issuedOn": "YYYY-MM-DD|null"   // od/os required for "enter"
    }
  }],
  "payment": { "option": "pay_at_pickup" }
          | { "option": "demo_card", "reference": "DEMO-…", "cardLast4": "4242", "cardBrand": "Visa" },
  "expectedTotalCents": 0,                         // the total the customer saw
  "contactLensRxConfirmed": false,                 // required true when the bag has contact lenses
  "note": "…|null", "marketingConsent": false, "smsConsent": false,
  "website": ""                                    // honeypot
}
```

What it does, in one transaction:

1. **Checks the bag and the prices.** It re-prices the bag and refuses with `409` ("Prices changed…") if the total differs from `expectedTotalCents`.
2. **Finds or creates the customer.** It matches an existing customer by email, then phone. A matched record is **never modified** by this anonymous input. A new one is created with source *website* and the consent given.
3. **Creates the order.** It creates a `sales` row (`kind=order`, `channel=website`), with a ready-by date of +7 days when the order has lenses and +2 days otherwise.
4. **Records the payment.** For `demo_card` it records an `online_demo` payment for the full amount, with the reference and the last four digits. The dashboard never receives a card number.
5. **Stores the website details.** It writes a `website_orders` row with the contact as entered, the payment option, consents, the note, the IP, and the prescriptions **as typed by the customer** (unverified; they are not written to the clinical prescriptions table).
6. **Reserves the stock.** It moves the order to *confirmed*, which reserves every stocked unit at the branch and queues the GoHighLevel sync. If the branch no longer has enough, the whole order is rolled back with `409` ("Some items just sold out at this branch…").

**Response:** `{ "order": OrderView, "token": "…", "replayed": false }`.

**Idempotency:** the same `idempotencyKey` with the same body returns the same order (`replayed: true`). With a different body it returns `409`.

**Order token:** an HMAC-SHA256 of the order id with `APP_SECRET`. Only its SHA-256 is stored, and it is compared in constant time.

### `GET /orders/<number>` (scope `orders:read`, header `X-Order-Token`)

`{ "order": OrderView }`, where `OrderView` contains:

- `number`, `placedAt`, `status`, `stage`, `paymentStatus`, `paymentOption`
- `currency`, `subtotalCents`, `taxCents`, `totalCents`, `paidCents`, `balanceDueCents`
- `readyBy`, `readyAt`, `completedAt`, `cancelledAt`, `cancelledByCustomer`, `canCancel`
- `contact`, `branch` (with address, phone, map link and hours), `items`, `prescriptions`
- `timeline`: stage changes from the order's audit trail, with no staff names

A wrong number and a wrong token both give `404`. Responses are `no-store`.

### `POST /orders/<number>/cancel` (scope `orders:write`, header `X-Order-Token`)

The customer can cancel an order while it is still *new* or *confirmed* and **nothing has been paid**. Cancelling releases the reservation and returns `{ "order": OrderView }`. Cancelling twice is harmless. A paid order (the demo card), or one where work has started, gets `409` with a message to contact the branch.

### `POST /orders/lookup` (scope `orders:read`)

"Find my order": `{ "number": "ORD-000123", "email": "…" }` returns `{ "number", "token" }`. If either part is wrong the response is `404`, so it doesn't reveal which.

### In the dashboard and GoHighLevel

- **Orders list:** website orders show a *Website* badge.
- **Order page:** a *Website order* card shows:
  - the contact details as entered
  - the payment option (demo card marked "not charged")
  - consents and the customer's note
  - each typed prescription, with the warning that it isn't verified
  - the contact-lens confirmation
  - whether the customer cancelled
- **Payments:** the Payments page can filter by *Online card (demo — not charged)*. Staff can't choose that method themselves.
- **GoHighLevel:** the order syncs as an opportunity like any other order. The label is *Website order* and the source *Website (demo store)*. The note says the order was placed on the website for pickup and, for the demo card, that nothing was charged and the payment was not processed by GoHighLevel Payments.

## Public catalogue feed (anonymous, opt-in)

For a website hosted outside the dashboard, such as the GoHighLevel site in `optical-ghl-website`, which can't hold a secret key.

- `GET /api/public/v1/feed/<business-slug>/site`: same shape as `GET /site`, plus `services[].calendars` (`branchId`, `calendarId`) for calendars mapped in Settings → Integrations → GoHighLevel.
- `GET /api/public/v1/feed/<business-slug>/products`: same as `GET /products`. Each summary also has `colours` (distinct variant colours) and `filters` (`shape`, `material`, `frameType`, `lensType`, `gender`, `ageGroup` when set).
- `GET /api/public/v1/feed/<business-slug>/products/<slug>`: same as `GET /products/<slug>`.

The feed is anonymous:
- **Off by default.** The owner switches it on in Settings → Website → Public catalogue feed. A feed that is off and an unknown business both return `404`.
- **CORS** only for the origins the owner lists (`https://` or `localhost`, up to 10). Other origins still get the JSON, but no `Access-Control-Allow-Origin`, so browsers on other sites can't read it. This limits embedding; it is not authorisation, because the data is public by design.
- The same data limits as the keyed API apply: published products only, coarse availability, and never costs, quantities or customer data.
- **Rate limit:** 240 requests per minute per IP and business, then `429` with `Retry-After`.
- **Caching:** `Cache-Control: public, max-age=60, s-maxage=60`, `Vary: Origin`. There is no stale-while-revalidate, so switching the feed off reaches visitors within a minute (verified live: 61 s).
