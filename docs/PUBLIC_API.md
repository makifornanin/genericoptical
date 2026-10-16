# Public website API (v1)

Read-only business data and inquiry intake for the **customer website**, a separate Vercel project. The website calls this API **from its server only**: Next.js server components and route handlers. Browsers never call it, and it sends no permissive CORS headers.

- **Base path:** `/api/public/v1`.
- **Implementation:** `src/app/api/public/v1/**`, `src/server/services/public-api.ts`.

## Authentication and business isolation

- **Header:** every request sends `Authorization: Bearer <site key>`.
- **What a key is:**
  - Site keys are per business and stored only as a SHA-256 hash (table `api_keys`).
  - Each key carries scopes: `site:read`, `catalog:read`, `inquiries:write`.
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
