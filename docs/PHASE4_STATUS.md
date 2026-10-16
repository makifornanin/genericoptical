# Phase 4 status: two deployments, connected backend, smarter POS

Status as of 2026-10-16. Labels:
- **Implemented and tested**: automated tests pass locally.
- **Deployed and tested**: checked on the live Vercel URL.
- **Locally tested only**: worked against the local stack, not on Vercel.
- **Requires credentials**
- **Requires GHL configuration**
- **Not yet implemented**

Nothing has been tested against a real GoHighLevel account.

## 1. Where things are

| | Management dashboard | Customer website |
|---|---|---|
| Folder | `C:\Users\Mark\Documents\generic eye` | `C:\Users\Mark\Documents\optical-customer-website` |
| Stack | Next.js 16.4.1, PostgreSQL (Drizzle) | Next.js 16.4.1, TypeScript, the original `oc` design system |
| Git | Branch `phase-4`, clean, no remote (not pushed) | Branch `phase-4`, clean, no remote (not pushed) |
| Vercel project | `optical-management-dashboard` | `optical-customer-website` |
| Staging URL | https://optical-management-dashboard.vercel.app | https://optical-customer-website.vercel.app |
| Region | Singapore (`sin1`) | Singapore (`sin1`) |
| Database | **Neon**, Singapore (`ap-southeast-1`), project `frosty-rain-06210397` (connected 2026-10-16). Local dev: embedded PostgreSQL on `:54329`. | None by design: it only calls the dashboard API. |

The website never connects to PostgreSQL. It calls the dashboard's public API from its server with a scoped site key ([PUBLIC_API.md](PUBLIC_API.md)). Browsers never call the dashboard, and the dashboard sends no CORS headers.

## 2. Deployments

| Item | Status | Evidence |
|---|---|---|
| Dashboard on Vercel (before Neon) | Deployed and tested without a database | `/login` 200, `/app/*` redirects to sign-in, security headers present, `/api/public/v1/site` without a key → 401, `/api/health` → 503 `database: unreachable`. |
| Website on Vercel | **Deployed and tested** (setup state) | 15 routes return 200. Each page shows "Setup needed" because there is no site key yet. `noindex` and `robots: Disallow /`, CSP present, no secrets in the HTML, inquiry → 503 "please call us", revalidate with a wrong secret → 401. |
| **Dashboard on Vercel, with Neon** | **Deployed and tested** | `/api/health` → `{"status":"ok","database":"ok"}`. In a real browser, the demo owner signed in. Dashboard, POS (107 product tiles), Customers and Inventory loaded demo data, and it was still there after reloading. No page errors. |
| **Website on Vercel, live catalogue** | **Deployed and tested** | Real products from Neon on every page (no "Setup needed"): prices, variants, per-branch availability, images served by the dashboard. No secrets in the HTML. |
| **Website → dashboard on Vercel** | **Deployed and tested** | The live contact form created a lead, visible in the live dashboard with source *Website*. The site key was created through the live Settings screen. |
| **Login screen** | **Deployed and tested** | Text-only "Optical Platform" wordmark; no eyeglasses icon or arrows. |

## 3. Customer website

All pages are built: Home, Eyewear (catalogue), Product details, Services, Book, Contact, About, FAQ, Privacy, Terms, Booking confirmed, Thank you. The design is carried over (CSS files moved unchanged).

| Feature | Status |
|---|---|
| Products, categories, variants, prices, images and coarse availability come from PostgreSQL through the API. There is no static product data. | Implemented and tested (fixture API). **Locally tested** against the real dashboard API. |
| Search, category filters, URL state, product variants, per-branch availability, mobile navigation, branches, hours, services, price list | Implemented and tested (Playwright at 390/768/1280/1920 px, axe WCAG 2.2 AA) |
| Product changes reach the site: instantly via the dashboard's revalidation call, otherwise within 60 s | **Locally tested only.** A price change appeared after `revalidateWebsite()`. A POS sell-out appeared via the 60 s refresh. |
| Inquiry, contact and appointment-request forms → dashboard lead (source *website*, page recorded) → GHL contact with source "Website", deduplicated by email then phone | Website → dashboard **locally tested** (lead `LD-00104`, repeat merged). Dashboard → GHL tested **with the simulator only**. **Requires GHL configuration** for live verification. |
| Booking: official GHL widget for the calendar mapped to the branch and service; a clear setup state and appointment request where nothing is mapped | Implemented and tested (setup state and widget address). **Requires GHL configuration** (calendar mapping). The live widget has not been seen. |
| Online checkout | Deliberately **not implemented**. No checkout button exists, and browsing, inquiry and in-store purchase are kept separate. |
| Outages: the dashboard down → the site serves its last good copy; forms fail politely | **Locally tested** (dashboard stopped) |

## 4. POS upgrade (design preserved)

| Area | What was done | Status |
|---|---|---|
| A. Fast selection | Search, SKU and barcode on Enter; **server lookup for exact codes not loaded on screen** (the screen loads 600 items); category tabs; "In stock only"; **recent items** (per branch, per browser); **low-stock badges**; keyboard shortcuts `/` or F2 (search), Esc, F8 (hold), F9 or Ctrl+Enter (complete) | Implemented and tested |
| B. Smart cart | Quantities capped by stock; discounts limited by permission (enforced on the server); tax; line totals; **live server quote**: the server re-prices the cart and re-checks stock as it changes. Checkout is blocked if prices changed or stock ran out. Checkout itself stays fully server-authoritative. | Implemented and tested |
| C. Customer recognition | Phone matching on digits (+63, 0, spaces, dashes); email match ignores case. New customers are checked for duplicates with "Use this customer" or an explicit "Create anyway"; the server enforces this on the staff path. **Linked-customer context**: purchase count, last visit, balance owed, recent items. Business-scoped. | Implemented and tested |
| D. Payments | Cash (tendered and change), card, GCash, Maya, bank, other; split and partial; balance due requires a customer. Non-cash payments are labelled **recorded manually, not electronically verified** on screen and on receipts. | Implemented and tested (existing tests plus wording) |
| E. Held carts | Hold, list, resume and discard per branch. **No stock reservation.** Expire after 7 days. Resume works exactly once (row lock) and re-checks stock and prices. | Implemented and tested |
| F. Inventory | Unchanged and verified: stock locked and checked inside the checkout transaction, never oversold under concurrency, one idempotent movement per line, sale idempotency key, customer history and GHL events in the same transaction | Implemented and tested |
| G. Insights | From real records only: popular items (30 days), low stock, repeat customers (90 days), outstanding balances, recent transactions. Respects permissions. | Implemented and tested |
| H. Receipts | Business, branch, customer, items, totals, payment breakdown, print layout, **downloadable PDF**, and "**This is not an official receipt or tax invoice.**" | Implemented and tested (PDF checked visually) |
| I. Refunds and voids | Already complete; verified: full and partial refunds, restocking via movements, caps, duplicate-proof idempotency, payment voids with audit | Implemented and tested (existing) |
| J. GHL sale sync | Durable outbox events; opportunity value is CRM data, never revenue; the contact note says payments were taken at the shop's POS, not processed by GHL; the sale stays valid when GHL is down | Implemented and tested (simulator). **Requires GHL configuration** (pipeline). |

## 5. Defects found and fixed this phase

1. **The dashboard build failed without `DATABASE_URL`:** the sign-in brand panel queried the database while prerendering. It now reads at request time and falls back if the database is down.
2. **The public API swallowed Next.js control-flow errors** while prerendering. They are now rethrown (`unstable_rethrow`).
3. **Receipt uploads would be silently lost on Vercel** (temporary disk). Uploads are now refused there with a clear message until object storage exists.
4. **Duplicate customers:** there was no duplicate check, and phone search failed across formats (`0917…` vs `+63 917…`). Both are fixed.
5. **The receipt could pass for an official tax document**, and manual card or e-wallet payments looked verified. Both are now labelled.
6. **Scans of items beyond the 600 loaded on screen** weren't found. A server lookup now handles them.
7. **The Settings card showed the wrong `DASHBOARD_API_URL` form.** It now shows the origin, and the website accepts both forms.
8. **The new Vercel projects had no framework preset**, so every path returned Vercel's 404. `vercel.json` now pins Next.js.
9. **Per-branch availability omitted branches that never stocked an item.** They now show as out of stock.
10. **Website leads reached GHL as "Optical dashboard (website)".** They now use the source "Website".

## 6. Test results (this phase, all run locally)

| Suite | Result |
|---|---|
| Dashboard lint, typecheck, production build (with and without a database) | Pass |
| Dashboard vitest (unit, database, components) | **20 files, 196 tests passed**. New: public API (13), POS and held carts, insights, quote, customer recognition, PDF (9), website → GHL (2), POS terminal component (9, of which 4 new). |
| Dashboard Playwright E2E (dev server, seeded demo) | **18/18 passed** after two locator fixes needed by the new POS chips and low-stock label |
| Website lint, typecheck, build | Pass |
| Website tests (fixture API) | **133/133 passed**: 11 unit, 120 site (every page at four widths, axe, behaviour, security headers, no secrets), 2 outage |
| Cross-system (local website ↔ local dashboard ↔ PostgreSQL) | Pass: real data on every page, product change → revalidate, POS sell-out → website, inquiry → lead, dashboard outage |
| POS concurrency, inventory reconciliation | Pass: concurrent last-unit checkout (existing), concurrent held-cart resume (new), on-hand equals the sum of movements (seed integrity) |
| Deployment smoke tests | Pass on both Vercel URLs (section 2) |
| **Live GoHighLevel** | **Not run: no credentials or configuration** |

## 7. GoHighLevel status

- The integration code (OAuth and Private Integration token, outbox, webhooks with Ed25519 `X-GHL-Signature` and legacy RSA fallback, contacts, opportunities, calendars, products) is **implemented and tested against a simulator only**.
- **Requires GHL configuration and credentials:** the Private Integration token and location ID, the sales pipeline and stages, the calendar ↔ branch and service mapping, and optionally the marketplace app for OAuth.
- Form submission and booking **must not be considered working** until checked with the real account.

## 8. Needed tomorrow (in this order)

1. ~~Database~~: done on 2026-10-16 (Neon, migrated and seeded through the build).
2. ~~Website key~~: done (created in live Settings, set on the website).
3. **Decide the demo exposure** before connecting a real GHL sub-account. Staging lists the demo sign-ins: either set `DEMO_MODE=false` and change the passwords, or use a GHL test sub-account.
4. **GHL:** create the Private Integration token, then connect it in Settings → Integrations. Then:
   - choose the pipeline and stages;
   - map calendars to branches and services;
   - compare the embed-code domain with `api.leadconnectorhq.com/widget/booking/`.
5. **Live checks:**
   - one website inquiry → contact in GHL (source "Website"), and repeat it to confirm there's no duplicate;
   - one booking through the widget → appointment in GHL and the dashboard;
   - one POS sale with a customer → opportunity and note in GHL;
   - products and stock sync.
6. Optional: connect GitHub for automatic deployments; set up object storage for receipt uploads; a custom domain; and remove `SITE_NOINDEX` at launch.

## 9. Known limits and blockers

- **Database setup runs in the Vercel build** (sensitive variables can't be pulled locally). See [PRODUCTION_DATABASE.md](PRODUCTION_DATABASE.md).
- **Hobby plan:** the GHL worker cron runs once a day. Actions still sync immediately; Pro allows every 5 minutes.
- **Website rate limit:** the website's own first-line limit is per server instance. The durable limits are the dashboard's (PostgreSQL).
- **Legal text** on the website is still a draft and needs legal review.
- **`npm audit`:** high-severity findings only in the website's ESLint toolchain, not in the deployed code.
- **Demo-DB test leftovers:** cross-system test records in the local demo database were removed by reseeding.
