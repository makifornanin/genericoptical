# Phase 5 status: fullscreen POS, live GoHighLevel CRM, GoHighLevel website

Status as of 2026-10-17. Labels:
- **Deployed and tested live**: checked on https://optical-management-dashboard.vercel.app.
- **Live GHL**: done against the real GoHighLevel test sub-account.
- **Simulated**: covered by automated tests against the GHL simulator (`tests/db/ghl-fake.ts`), not against GHL.
- **Not tested live**: built and unit-tested, but not exercised against GHL.

## 1. Where things are

| | Management dashboard | GoHighLevel website |
| --- | --- | --- |
| Folder | `C:\Users\Mark\Documents\generic eye` | `C:\Users\Mark\Documents\optical-ghl-website` (new) |
| Git | Branch `phase-5` (from `main`), no remote. Last commit `fbf1fd5`. | Branch `main`, commit `48ce773`, no remote |
| Deployed | Vercel `optical-management-dashboard` (Singapore), production, 2026-10-17. Migrations 0011 and 0012 applied by the build (13 in total); no data was reset or reseeded. | **Not deployed** (by design). It is pasted into GoHighLevel; see its `documentation/ghl-setup-guide.md`. |
| Old customer website | `optical-customer-website` on Vercel: unchanged and kept as the archive and fallback. Nothing was deployed to it. | |

## 2. Fullscreen POS

The dashboard design is unchanged: same tokens, components and sidebar on every other page.

| Area | What it does | Status |
| --- | --- | --- |
| Register layout | `/app/pos` renders without the app sidebar. A compact header shows the branch picker, signed-in cashier, held carts, insights, shortcuts, a **Full screen** toggle (browser Fullscreen API; Esc or F11 also leave) and **Exit POS**. | Deployed and tested live (exit, full-screen toggle, no sidebar, 54 product groups) |
| Responsive | Desktop and tablet: products and cart side by side. Phone: separate Products and Cart views, with a sticky "n items · total · Review sale" bar. | Component tests; live screenshots at 1440 and 390 px |
| Finding products | Search by name, brand, SKU or barcode (Enter looks up an exact code on the server even when it isn't loaded on screen). Category tabs plus **Popular here** (this branch's best sellers over 30 days). **Recent items**, per branch. Products grouped with a **variant picker**. Stock badges: "12 in stock", "Low · 2 left", "Out of stock". Arrow keys move around the grid. | Component tests (15) |
| Keyboard | `/` or F2 search, arrows, Enter add, Alt+C customer, Ctrl+Enter charge then complete, F8 hold, Esc back or close. Ignored while a dialog is open; none overrides a browser shortcut. | Component tests |
| Customers | Lookup by name, phone or email. Philippine numbers normalised (`0917…`, `+63 917…`, `63-917…` match). Duplicate check before creating. | Unit tests (11 phone cases) and DB tests |
| Cart | Line discounts (amount or %) and an order discount, limited by the cashier's permission and the business's maximum staff discount, enforced on the server. Live server quote re-prices and re-checks stock. Held carts keep line discounts and **never reserve stock**. | Component and DB tests |
| Payment step | Cash with tendered amount, quick-cash buttons and change. Card, GCash, Maya and bank with a reference and the note **"Recorded manually … Not electronically verified"**. Split across up to 4 methods. Partial payment leaves a balance due, which needs a customer. | Component tests and E2E (cash sale, partial then settled) |
| Completion | Itemised summary, **Print receipt**, **PDF**, New sale, View transaction details. Receipts carry "This is not an official receipt or tax invoice." | E2E |
| Reliable checkout | One idempotency key per checkout, so a double click or retry returns the same sale; stock is deducted once. | DB tests (existing) and E2E "deducts stock once" |

## 3. GoHighLevel CRM (test sub-account `PanapaAntipara`, `JNRAUfOQf6IVLR49eWGZ`)

The connection uses a Private Integration token stored encrypted in the dashboard; it is never shown or logged.

### Live results

| Check | Result | Status |
| --- | --- | --- |
| Access check (read-only) | 7/7 OK: sub-account, contacts, pipelines and opportunities, calendars (3), users (6), products and stock, online-store orders. Re-run on 2026-10-17 after the final deploy. | **Live GHL** |
| Pipelines | Created **"Optical — Lead Management"** `FyMpGu5k33PQKRrcbW00` (New Lead, Contacted, Qualified, Appointment Scheduled, Follow-Up, Converted) and **"Optical — Sales & Orders"** `ZbUWBAdZwpsAn6mTCPcc` (New Order, Payment Pending, Processing, Ready for Pickup, Completed). Every stage was mapped automatically. A second run reported "already existed" and created nothing. No other pipeline was touched. | **Live GHL** |
| Lead → contact + opportunity | Website lead `LD-00106` became contact `CxJofFZXD7L8U0e5l03i` with an opportunity in the lead pipeline. Its stage then moved Qualified → Follow-Up from the dashboard. | **Live GHL** |
| POS sale → contact + opportunity + note | Sale `S-002848` (partial payment): contact `xZ0Lc1dFtTf4BtUyS9uT`; opportunity at **Payment Pending** (open, ₱220). When the balance was paid it moved to **Completed** (won). It synced automatically, with no "Sync now". Earlier sale `S-002846` → opportunity `OxERNjswU2t7taLzhI5d`. The contact note says the payment was recorded at the shop. **No GHL order, invoice or transaction is created**, and Won is never treated as a GHL payment. | **Live GHL** |
| Products and inventory | "Lens Cleaning Spray 60 ml" was published as GHL product `6ad226d07290e7a7e970acfe`. A POS sale pushed its available quantity to price `6ad226d04ed17f25456368fa`. Reconciliation found no differences. Product and inventory sync were **switched back off** afterwards. | **Live GHL** |
| Failures shown honestly | GHL's own error text is shown in Settings (for example, the first pipeline create returned 422 until stages were sent as objects). Each lead and sale page shows a GoHighLevel card: Synced / Queued / Needs attention, with links. | **Live GHL** |

### Not tested live

| Item | Why | What happens instead |
| --- | --- | --- |
| Webhooks (GHL → dashboard in real time) | A Private Integration token can't subscribe to marketplace webhooks. No GHL webhook event was received, so **live webhook testing has not passed**. | Lead-pipeline changes made in GHL are picked up by reconciliation (the daily cron, or **Run reconciliation**). The webhook handlers are covered by simulated tests. |
| A stage change made inside GHL, applied to the lead | Needs a GHL-side change plus reconciliation. | **Simulated** (`tests/db/ghl-phase5.test.ts`: GHL owns lead stages; Won never converts a lead; no echo back to GHL). |
| Calendars | The sub-account has 3 calendars, not yet mapped to branches and services. | Mapping UI deployed (branch, service and the new optional practitioner). Booking sync **simulated** only. |
| Refunds and cancellations | Not exercised live. | **Simulated**: a partial refund lowers the opportunity's value; a full refund or a cancellation moves it to lost. |

### Ownership rules (unchanged in principle, extended to leads)

- GoHighLevel owns lead-pipeline stages. A stage change there updates the dashboard lead's stage; a Won opportunity never converts the lead or creates a sale.
- The dashboard owns sales, payments, stock and refunds. Their opportunities follow the sale: New Order, Payment Pending, Processing, Ready for Pickup, Completed (won); cancelled or refunded → lost.
- Every write the dashboard makes is remembered, so its echo coming back from GHL is ignored.

## 4. Public catalogue feed (new)

It lets a website hosted outside the dashboard, such as the GoHighLevel site, read the live catalogue without any secret.

- `GET /api/public/v1/feed/<business>/site`, `/products`, `/products/<slug>`. These are anonymous, read-only and **off by default** (Settings → Website → Public catalogue feed).
- A feed that is off, or a business that doesn't exist, returns the same 404.
- CORS headers are sent only to the origins the owner lists. That limits embedding; it is not authorisation, and the data is public by design.
- The feed exposes published products only, with coarse availability. It never includes costs or on-hand quantities. Product summaries carry colours and shape/material for storefront filters.
- Rate limit: 240 requests per minute per IP. Responses are cached for 60 s at the CDN.

**Deployed and tested live**, and left **off**:
- Enabled for `http://localhost:4300`: `/site` returned 200 (3 branches, 3 services) and `/products` 44 products with colours and filters.
- A product detail returned 4 variants × 3 branches.
- Another origin got no CORS header.
- No costs or quantities appeared in the output.
- Switched off: 404 after 61 s. A first attempt showed the CDN serving the switched-off feed for minutes (stale-while-revalidate). That was fixed in `fbf1fd5` and re-tested.

## 5. GoHighLevel customer website (new folder)

`C:\Users\Mark\Documents\optical-ghl-website`: 12 pages (home, eyewear, item, services, booking, contact, about, FAQ, privacy, terms, booking confirmed, thank you) as numbered copy-and-paste blocks for GHL Custom Code elements.

- **Design**: grounded in visually inspected references, with Ace & Tate primary and Warby Parker and Jimmy Fairly for one or two details each. What was and wasn't inspected is recorded in `documentation/design-references.md`.
- **Content rules**: no gradients, blur, emoji, testimonials or stock or AI imagery; the tests enforce this. Missing brand photos are labelled photo slots.
- **Tests**: 73 Playwright checks in the local preview. They cover CSS scoping, links, the paste build, every page at 390/768/1280/1440 with no overflow, axe (WCAG 2.2 AA, no serious or critical issues), interactions, feed-off and feed-error fallbacks, the GHL calendar and form embeds, host-CSS isolation and the `hydrationDone` wait.
- **Not verified inside the GoHighLevel builder.** Its setup guide lists what to check there.

## 6. QA summary (2026-10-17)

| Suite | Result |
| --- | --- |
| ESLint | 0 errors |
| TypeScript (`npm run typecheck`) | Pass |
| Vitest: unit, component, DB (23 files) | **229 / 229** |
| Playwright E2E, dashboard (local dev and local database) | **18 / 18**, updated for the two-step POS charge and the variant picker |
| `next build` | Pass, locally and on Vercel |
| Website Playwright (`optical-ghl-website`) | **73 / 73** |

### Bugs found and fixed in Phase 5

1. **GHL pipeline create returned "Something went wrong".** GHL's real error is now surfaced; the cause was a 422 for stages sent as strings. Stages are now sent as `{ name, position, showInFunnel }`.
2. **A POS sale's GHL sync stayed "Queued"** because the after-response run didn't claim the event. Fixed in three parts:
   - due times are stamped with the database clock;
   - the run retries once;
   - every successful server action schedules a kick.
   Verified live with `S-002848`.
3. **The public feed kept serving for minutes after being switched off** (CDN stale-while-revalidate). The stale window was removed; verified live.
4. **Lint failure in the feed card** (unescaped apostrophe): fixed.
5. **Temporary live-test scripts committed by `git add -A`**: removed from the index and ignored (`scripts/.tmp-*`). Nothing was pushed, and the only credential in them is the demo password, which is already in the seed source.
6. **Website** (caught by its tests and screenshots):
   - page CSS aimed at block roots never matched; now `.ow.root`, and a test guards it;
   - the product gallery grew to the image's natural width;
   - `/product/` is a reserved GHL path, so the page is now `/item`;
   - head tracking code may truncate, so the CSS and JS moved into the global sections;
   - the script now waits for GHL's `hydrationDone`.

## 7. Manual configuration still needed

1. **Calendars**: map the 3 GHL calendars in Settings → Integrations → GoHighLevel → Sync settings & mapping → Calendars (branch, service, optional practitioner). In GHL, set each calendar's confirmation redirect to `/booking-confirmed`.
2. **GHL website**: build it in the **test** sub-account following `optical-ghl-website/documentation/ghl-setup-guide.md`, then run its "Check in the builder" list. That covers:
   - the contact form with hidden `product`, `ref` and `topic` fields, redirecting to `/thank-you`;
   - turning "Optimize JavaScript" off.
3. **Catalogue feed**: once the GHL site's domain is known, switch the feed on with that origin and put the feed URL in `OW_CONFIG.feedBase`.
4. **Real-time inbound changes** need the marketplace app (OAuth) and its webhook URL (Settings → Endpoints). Until then, GHL-side lead stage changes arrive with reconciliation (daily cron at 02:15 Manila, or on demand).
5. **GHL workflow** to text customers when an order reaches "Ready for Pickup", if the site's "we text you" promise is kept.
6. **Before real customers**:
   - change the demo staff passwords;
   - keep `SHOW_DEMO_LOGINS` unset (demo sign-ins are hidden on Vercel);
   - review the draft privacy notice and terms;
   - replace the demo brand.
