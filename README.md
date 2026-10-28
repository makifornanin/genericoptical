# Optical customer website

The customer-facing shop for the optical business run from the management dashboard. It covers glasses, sunglasses, contact lenses and accessories, prescription lens selection, a bag, checkout for pickup at a branch, order tracking, eye-exam booking, stores, help and contact.

It is a **demonstration store**. Orders are real records in the dashboard, and they reserve real (demo) stock. But no money is taken: the "card" option accepts only published test card numbers and is recorded as *Online card (demo — not charged)*. Every page says so in the top bar.

Built with **Next.js 16 (App Router) + TypeScript**, plain CSS, and deployed on **Vercel** as its own project. It shares no code with the dashboard. Everything it shows or changes goes through the dashboard's public API (`/api/public/v1`, documented in the dashboard repository at `docs/PUBLIC_API.md`). That API is called **from this site's server only**, with a secret site key.

- Design: [DESIGN_REFERENCES.md](DESIGN_REFERENCES.md) (what was studied and why) and [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) (tokens, type, components)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Imagery: renders made with [tools/renders/README.md](tools/renders/README.md) for the featured products, Pexels stock photos for the rest (see [DESIGN_REFERENCES.md](DESIGN_REFERENCES.md#imagery-renders-and-stock-photos))

```
optical-customer-website/
├── src/
│   ├── app/                   pages (below) + api/ route handlers
│   ├── components/            Header, Footer, ProductTile, CollectionView, Gallery, ProductPurchase,
│   │                          LensFlow, BagProvider, BagView, CheckoutForm, OrderLookup, Drawer …
│   ├── lib/                   api.ts + orders-api.ts (server-only dashboard client), api-types.ts,
│   │                          catalog.ts, filters.ts, lens.ts, bag.ts, demo-card.ts, media.ts,
│   │                          content.ts, theme.ts, format.ts, env.ts, rate-limit.ts, seo.ts
│   └── styles/                tokens.css, base.css, components.css, pages.css
├── public/media/              renders (products/<slug>/…, editorial/…), stock/ photos, swatches/
├── tools/renders/             the GPU path-tracing tool that makes the renders
├── tools/stock/               import.mjs: crops stock photos into public/media/stock
├── tests/
│   ├── fixtures/              fixture dashboard API (api-server.mjs), data snapshot, build helper
│   ├── e2e/                   Playwright: pages, shop, checkout, api, seo, a11y, secrets, outage
│   └── unit/                  pure helpers (bag, filters, lens values, demo card, theme …)
└── docs/                      DEPLOYMENT.md, DESIGN_SYSTEM.md
```

## Pages

| Route | What it shows | Data | Rendering |
|---|---|---|---|
| `/` | hero, collections, shapes, eye exam, stores | `/site`, `/products` | ISR 60 s |
| `/glasses`, `/sunglasses`, `/contact-lenses`, `/accessories` | collection grid with filters (shape, colour, material, size) and sort, state in the URL | `/products` | per request (filters are in the URL), data cached 60 s |
| `/products/[slug]` | gallery, colours, sizes, per-branch stock, buy panel (frame + lenses / sunglasses / contact lenses per eye / accessory) | `/products/:slug`, `/lenses` | ISR 60 s |
| `/bag` | lines with their parts (frame, lens, prescription), live prices and which branches can fulfil the bag | `POST /cart/quote` via `/api/cart/quote` | client |
| `/checkout` | contact, pickup branch, prescription reminder, payment (demo card or pay at pickup), consent | quote + `POST /orders` via `/api/checkout` | client |
| `/order` | find an order by number + email; also links the last order placed in this browser | `/orders/lookup` via `/api/orders/lookup` | client |
| `/order/[number]?t=…` | status tracker, items, prescription as entered, pickup branch, cancel (if allowed) | `GET /orders/:number` with the order token | per request, never cached |
| `/eye-exam` | exam services and prices, and the business's **GoHighLevel booking calendar**. A calendar the dashboard maps to a service and branch takes priority | `/site` | ISR 60 s |
| `/stores` | branches, hours, open-now, map links | `/site` | ISR 60 s |
| `/about`, `/help` | business copy, FAQs (+ FAQPage JSON-LD) | `/site` | ISR 60 s |
| `/contact` | phone, email, branches, and the business's **GoHighLevel inquiry form** | `/site` | per request |
| `/privacy`, `/terms` | draft text with a visible "draft — needs legal review" notice | `/site` | ISR 1 h |
| `/search` | product search | `/products` | per request |

## How ordering works

1. **Bag.** It is kept in the browser's `localStorage`, so it survives reloads and is shared between tabs. Prices in the bag are never trusted: `/bag` and `/checkout` ask the dashboard for a quote (`POST /api/public/v1/cart/quote`). The quote returns the current prices, tax and the branches that can fulfil every line. It does not return stock counts.
2. **Lenses.** A frame can be bought alone, or with lenses from the dashboard's prescription-lens catalogue (`GET /lenses`): single vision, progressive or bifocal, then a lens option. The customer then chooses how to give their prescription: *enter it*, *send it later*, *use the one on file*, or *book an eye exam*. Typed values are checked in the browser and again by the dashboard (sphere/cylinder in 0.25 steps, axis required with cylinder, PD 40–85). They are stored as **typed by the customer, not verified**, and staff see that warning.
3. **Checkout.** The browser posts to this site's `/api/checkout`. That route checks the origin, a 32 KB size limit, a per-IP limit, the schema and a honeypot field. It then forwards the order server-to-server to `POST /api/public/v1/orders` with the site key and the visitor's IP. Each checkout attempt carries an idempotency key, so a double click or retry returns the same order. The dashboard re-prices the order and refuses it if the total changed ("Prices changed…") or if a branch no longer has the stock. Otherwise it creates the order (`kind=order`, `channel=website`), **reserves the stock**, matches or creates the customer by email then phone, and queues the GoHighLevel sync.
4. **Demo payment.** The card form accepts only the published test cards: `4242 4242 4242 4242` (Visa) and `5555 5555 5555 4444` (Mastercard) are approved, and `4000 0000 0000 0002` is declined. The full number is checked in the browser and **never leaves it**. Only the brand and last four digits are sent. The server checks the last four again, derives a `DEMO-…` reference from the idempotency key, and the dashboard records an `online_demo` payment. "Pay at pickup" records no payment.
5. **After ordering.** The order page URL carries an access token (an HMAC of the order id; the dashboard stores only its SHA-256). The customer can come back with that link, or find the order with number + email. Unpaid orders can be cancelled by the customer until they are being prepared, and cancelling releases the reservation.

The dashboard can switch website ordering off (Settings → Website → Website orders). The site then hides the buy buttons, says ordering is paused, and points to the contact form.

## GoHighLevel embeds

The business's own GoHighLevel account provides three things on the site. All their IDs are in `src/lib/ghl.ts`; they're public values that appear in the page HTML.

| Embed | Where | What happens |
|---|---|---|
| Inquiry form "General Inquiry" (`2f3PtQjuRm0033NMwe58`) | `/contact` | GHL's own form in an iframe. Submissions go **straight to GoHighLevel** (contact plus form submission there). They don't create a lead in the dashboard. |
| Booking calendar (`dOUtJja6Y2Le44UeYpuE`) | `/eye-exam` | GHL's booking widget. GHL handles availability, the booking and confirmations. If the dashboard maps calendars to services and branches (Settings → Integrations → GoHighLevel), the visitor picks those first and gets the mapped calendar. |
| Conversation AI chat (`6ad705dce19e4c46e8007fb6`) | every page except `/checkout` | GHL's chat bubble. It isn't loaded on checkout, so no third-party script runs where card details are typed. If it was loaded on an earlier page, it's hidden there. |

The account serves its widgets from the white-label domain `api.multiplytalents.io`. The Content-Security-Policy allows exactly these origins (see `next.config.ts`):
- frames: `*.leadconnectorhq.com`, `*.msgsndr.com` and the white-label domain
- scripts: the white-label domain and `*.leadconnectorhq.com`
- styles and fonts for the chat: `*.leadconnectorhq.com` and `fonts.bunny.net`

The tests stub every GHL request, so nothing in `npm test` reaches GoHighLevel.

Orders don't go through GHL: they go to the dashboard (below), which syncs them to GoHighLevel as opportunities.

## Environment

All variables are **server-only**. Nothing in this site uses a `NEXT_PUBLIC_` variable; adding one for these values would ship it to every visitor. Copy `.env.example` to `.env.local` for local work.

| Variable | Required | Purpose |
|---|---|---|
| `DASHBOARD_API_URL` | yes | Dashboard origin, e.g. `https://optical-management-dashboard.vercel.app`. Also needed at **build** time (the Content-Security-Policy is computed then) |
| `DASHBOARD_SITE_KEY` | yes | Site key from the dashboard (Settings → Website → Website API keys). Scopes: `site:read catalog:read inquiries:write orders:read orders:write` |
| `REVALIDATE_SECRET` | yes | Shared secret the dashboard sends to `POST /api/revalidate` |
| `SITE_URL` | in production | Public URL (canonical links, sitemap, robots) |
| `SITE_NOINDEX` | no | `1` keeps search engines out (automatic for a demo business) |
| `CSP_EXTRA_FRAME_SRC` | no | Extra frame origins for a white-label GHL booking domain |

Without `DASHBOARD_API_URL` / `DASHBOARD_SITE_KEY` the site builds and runs, and pages show a "setup needed" state.

## Local development

```bash
# 1. dashboard (other repository): database + app on http://localhost:3000
npm run db:start            # in the dashboard folder, keep running
npm run dev                 # in the dashboard folder
npm run site-key -- create --business lensmere-optical --name "Website (local)"   # prints the key once

# 2. this site on http://localhost:3200
npm install
cp .env.example .env.local  # DASHBOARD_API_URL=http://localhost:3000, DASHBOARD_SITE_KEY=<key>, REVALIDATE_SECRET=<random>
npm run dev
```

Without the dashboard, use the fixture API: `npm run fixtures` (port 3299) with `DASHBOARD_API_URL=http://localhost:3299` and `DASHBOARD_SITE_KEY=test-key`.

| Script | What it does | Ports |
|---|---|---|
| `npm run dev` / `npm start` | development / production server | 3200 |
| `npm run build` | production build (works with or without the API) | — |
| `npm run lint`, `npm run typecheck` | ESLint, `tsc --noEmit` | — |
| `npm run fixtures` | fixture dashboard API | 3299 |
| `npm test` | builds against the fixture API, then runs Playwright | 3210, 3299 |

The first time, install the Playwright browser: `npx playwright install chromium`.

## Caching

- API reads are cached for 60 seconds and tagged `site` or `catalog`. The dashboard calls `POST /api/revalidate` (`Authorization: Bearer <REVALIDATE_SECRET>`, body `{"tags":["site","catalog"]}`) after it changes products, prices, stock or website settings. Each tag is revalidated with `revalidateTag(tag, { expire: 0 })`.
- Quotes, checkout and order pages are never cached.
- If the dashboard is down, cached pages keep serving the last good data. Pages without a good copy show a friendly "isn't available right now" state, and the bag can't be priced or checked out until the dashboard is back.
- `GET /api/health` returns `{ "status": "ok", "api": "ok" | "unconfigured" | "unreachable" }`.

## Security

- The dashboard client is `server-only`. The site key and secrets never reach the browser, and a test greps the client bundles and the HTML for them.
- `/api/checkout`, `/api/cart/quote`, `/api/orders/*` and `/api/inquiry` reject cross-origin browser requests and oversized bodies. Checkout, order lookup and inquiries also have a first-line per-IP limit here. The durable limits (per key and per IP) are enforced by the dashboard.
- Order pages need the order token, which the dashboard compares in constant time. Lookup by number + email gives the same "not found" whether the number or the email is wrong.
- Headers (`next.config.ts`): Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.

## Tests

`npm test` builds the site against the fixture API and runs Playwright (Chromium). The fixture data is a snapshot of the local dashboard's demo business (`node tests/fixtures/snapshot.mjs`), and the fixture API implements the order endpoints in memory.

- **pages**: every page at 390, 768, 1280 and 1440 px. Checks for status 200, no horizontal overflow, no console errors, one h1 and no broken images.
- **shop**: filters and URL state, colour switching, sizes and branch stock, the lens flow (including prescription validation), and the bag (persistence, re-pricing, quantity, remove).
- **checkout**: demo card and pay-at-pickup orders end to end, declined and real card numbers refused in the browser, field errors, contact-lens confirmation, price change and sell-out refusals (nothing ordered), find my order, and customer cancellation.
- **api**: origin, size and validation checks, and refusal of unapproved demo cards.
- **seo, a11y, secrets, outage**: titles, robots and sitemap, and security headers; axe WCAG 2.2 AA on every page at mobile and desktop, plus the lens drawer, a filled bag, checkout errors and the order page; no secrets in client output; ordering switched off and the dashboard down.

- **ghl**: the contact form, booking calendar and chat embeds (IDs, placement, no chat on checkout) and the CSP origins they need.

**What these tests don't prove:** they run against fixture data, not the real dashboard. The real flow (website → dashboard order, stock reservation, payment record) is covered by the dashboard's own database tests and was checked by hand against a local dashboard. GoHighLevel is stubbed in the tests. The real embeds were loaded once in a browser on 20 October 2026: the calendar and chat loaded with no CSP violations, and the chat opened. The form's Cloudflare bot check keeps re-challenging an automated browser, so a real form submission still needs a check by hand.
