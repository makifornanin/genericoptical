# Phase 6 status: customer website and website orders (demo store)

Status as of 2026-10-20. Labels:
- **Tested locally**: automated tests and/or a hand check against the local dashboard and database.
- **Fixture-tested**: website tests against the fixture API (`tests/fixtures/api-server.mjs`), not the real dashboard.
- **Not deployed**: built and tested, not yet on Vercel.
- **Not tested live**: not exercised against production or GoHighLevel.

This is a **demonstration store**. Orders are real records with real (demo) stock reservations, but no payment provider is connected: "pay online" is a simulated card step, recorded as *Online card (demo — not charged)*.

## 1. Where things are

| | Management dashboard | Customer website |
| --- | --- | --- |
| Folder | `C:\Users\Mark\Documents\generic eye` | `C:\Users\Mark\Documents\optical-customer-website` (the existing website repo; old design removed) |
| Git | Branch `phase-6` (from `phase-5`), **uncommitted** | Branch `phase-6` (from `phase-4`), **uncommitted** |
| Vercel | `optical-management-dashboard`: **Phase 6 not deployed yet** (Phase 5 is live) | `optical-customer-website`: **Phase 6 not deployed yet** (the old Phase 4 site is live) |
| Docs | `docs/PUBLIC_API.md` → "Website orders" | `README.md`, `DESIGN_REFERENCES.md`, `docs/DESIGN_SYSTEM.md`, `docs/DEPLOYMENT.md`, `tools/renders/README.md` |

## 2. What changed in the dashboard (connection only; the UI design is unchanged)

| Area | Change | Status |
| --- | --- | --- |
| Public API | New endpoints: `GET /lenses`, `POST /cart/quote`, `POST /orders`, `GET /orders/<number>`, `POST /orders/<number>/cancel`, `POST /orders/lookup`. New key scopes `orders:read` and `orders:write`. `/site` returns `ordering`. | Tested locally (13 DB tests) |
| Website orders | `sales` row (`kind=order`, `channel=website`), stock reserved at placement, customer matched by email then phone and never modified, prescriptions stored **as typed, unverified**, idempotent placement, price-change and sell-out refusals, customer cancel (unpaid, not started) releases stock. | Tested locally; one order placed by hand from the website (ORD-000384: confirmed, demo payment, reservation active) |
| Demo payment | Payment method `online_demo` ("Online card (demo — not charged)"). Staff can't choose it. Only the brand and last 4 digits reach the server. | Tested locally |
| Database | Migration `0013_website_orders`: adds the `online_demo` enum value, the `website_orders` table and `'website'` to the sales channel check. Additive only. | Applied locally (14 migrations); **not applied in production yet** |
| Staff UI | "Website" badge in Orders, a *Website order* card on the order page (contact as entered, payment, consent, typed prescriptions with a warning), the Payments filter, and Settings → Website → *Website orders* on/off. The *Website content* card no longer says the site runs on GoHighLevel. Switching ordering refreshes the website. | Tested locally (seen in the browser) |
| GoHighLevel | Website orders sync as opportunities like other orders, labelled *Website order*, source *Website (demo store)*, with a note that the demo card charged nothing. | **Not tested live**; GHL isn't configured locally, so no sync event ran |

Checks: Vitest **242/242**, typecheck and lint clean (2026-10-20).

## 3. The customer website

| Area | Status |
| --- | --- |
| Design | Ace & Tate as the primary reference. What could and couldn't be inspected is in `DESIGN_REFERENCES.md`. Fixture-tested at 390, 768, 1280 and 1440 px, axe WCAG 2.2 AA |
| Shop | Collections with filters and URL state, product pages, lens flow (single vision, progressive, bifocal, plus prescription: enter, send later, on file, book exam), bag with live quote, checkout for pickup (demo card or pay at pickup), order page with status tracker and cancel, find my order. Fixture-tested; the full flow was checked by hand against the local dashboard |
| Imagery | Path-traced renders, 3 angles per colour, for 4 frames (Arden 101, Arden 204, Arden Round 33, Halden Wire), 9 care products and 10 editorial scenes. Every other product shows one of 11 **Pexels stock photos** chosen by the owner, labelled "Illustrative photo". The sunglasses and accessories also show eyeglasses photos (a known gap) |
| GoHighLevel embeds | The business's own **inquiry form** (contact page), **booking calendar** (eye-exam page) and **Conversation AI chat** (every page except checkout), via the white-label domain `api.multiplytalents.io`. Fixture-tested with GHL stubbed. Loaded once for real: the calendar and chat load with no CSP violations, and the chat opens. **A real form submission is not tested**, because GHL's Cloudflare check blocks automated browsers |
| Inquiries | The contact form submits to GoHighLevel directly, so these inquiries **don't appear as dashboard leads** (the GHL → dashboard webhook path still hasn't been tested live) |

Checks: Playwright **162/162** (unit, pages, shop, checkout, api, ghl, seo, a11y, secrets, outage), typecheck and lint clean (2026-10-20).

Bugs found and fixed while testing:
- Inquiry validation rejected requests that left out optional fields. This was a zod 4 optional-key change; the site's own form always sent every field, so it wasn't affected.
- The order tracker said "Lenses at the lab" on orders that have no lenses.

## 4. Still to do

1. **Deploy the dashboard** (`vercel deploy --prod` from `generic eye`). The build applies migration 0013 to Neon; nothing is reset or reseeded.
2. **Create a production site key** in the live dashboard (Settings → Website → Website API keys → New key). The website's current key predates Phase 6 and can't place orders. Store it as the website's `DASHBOARD_SITE_KEY`, marked sensitive and never echoed.
3. **Deploy the website** (`vercel deploy --prod` from `optical-customer-website`).
4. **Live check:**
   - place one demo-card order on the live site and confirm it in the dashboard: order, reservation, payment
   - check the GHL opportunity in the test sub-account
   - send one message through the GHL form by hand
5. **Commit both repositories** when the owner asks.
