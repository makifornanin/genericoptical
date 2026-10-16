# Optical customer website

The public website for an optical shop or eye clinic — home, eyewear catalogue, product pages, services, online booking, contact, about, FAQ, privacy, terms and confirmation pages — built with **Next.js 16 (App Router) + TypeScript** and deployed on **Vercel** as its own project.

All business data comes from the management dashboard's **public website API** (`/api/public/v1`, contract in the dashboard repository: `docs/PUBLIC_API.md`), called **from this site's server only** with a secret site key. GoHighLevel (GHL) is used only for the CRM (the dashboard syncs website leads to it) and for its native booking calendars, embedded with GHL's official widget.

The design is the original customer website's, unchanged: same markup structure, class names and CSS (see [design-system/README.md](design-system/README.md)). The previous GoHighLevel-builder version is kept, unbuilt, in [`legacy/ghl-builder/`](legacy/ghl-builder/README.md).

```
optical-customer-website/
├── src/
│   ├── app/                  routes: /, /eyewear, /eyewear/[slug], /services, /book, /contact, /about,
│   │   │                     /faq, /privacy, /terms, /booking-confirmed, /thank-you, sitemap.xml, robots.txt
│   │   └── api/              inquiry (POST), revalidate (POST), health (GET)
│   ├── components/           header, footer, product card/detail, catalogue, booking, inquiry form …
│   ├── lib/                  api.ts (server-only API client), api-types.ts, env.ts, site-settings.ts,
│   │                         catalog.ts, format.ts, theme.ts, inquiry-schema.ts, rate-limit.ts, seo.ts
│   └── styles/               oc-base.css, pages/*.css, forms.css, app.css
├── public/                   brand/favicon.ico, products/*.svg (test fixtures / sample art only)
├── tests/
│   ├── fixtures/             fixture dashboard API (api-server.mjs), data, build helper
│   ├── e2e/                  Playwright end-to-end tests
│   ├── unit/                 unit tests for the pure helpers
│   └── tools/                screenshots.mjs, compare.mjs
├── docs/DEPLOYMENT.md        Vercel specifics
├── design-system/README.md   tokens, typography, components, rules, changes
├── screenshots/              {mobile,tablet,desktop,wide}/<page>.png, states/, compare/, ghl-version/
└── legacy/ghl-builder/       superseded GoHighLevel-builder version (reference only)
```

## Environment

All variables are **server-only**. Nothing in this site uses a `NEXT_PUBLIC_` variable, and none must be added for these values (it would ship them to every visitor). Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Purpose |
|---|---|---|
| `DASHBOARD_API_URL` | yes | Dashboard base URL, e.g. `https://dashboard.example.com` (the full `…/api/public/v1` path is also accepted). Must also be set at **build** time: it feeds the Content-Security-Policy. |
| `DASHBOARD_SITE_KEY` | yes | Secret site key (Bearer token) created in the dashboard. |
| `REVALIDATE_SECRET` | yes | Shared secret the dashboard sends to `POST /api/revalidate`. |
| `SITE_URL` | yes in production | Public URL of this site (canonical links, sitemap, robots). Falls back to Vercel's production URL, then `http://localhost:3200`. |
| `SITE_NOINDEX` | no | `1` keeps search engines out. Automatic when the dashboard marks the business as a demo (`business.isDemo`). |
| `CSP_EXTRA_FRAME_SRC` | no | Extra frame origins (space-separated) for a white-label GHL booking-widget domain. |

Without `DASHBOARD_API_URL` / `DASHBOARD_SITE_KEY` the site still builds and runs; pages show a "Setup needed" notice instead of data.

## Local development with the dashboard

1. Run the dashboard (separate repository) on `http://localhost:3000`.
2. Create a site key there (the command prints the key once):
   ```bash
   npm run site-key -- create --business lensmere-optical --name "Customer website"
   ```
3. In this repository:
   ```bash
   npm install
   cp .env.example .env.local   # set DASHBOARD_API_URL=http://localhost:3000 and DASHBOARD_SITE_KEY=<key>
   npm run dev                  # http://localhost:3200
   ```

Without the dashboard, run the fixture API instead: `npm run fixtures` (port 3299) and set `DASHBOARD_API_URL=http://localhost:3299`, `DASHBOARD_SITE_KEY=test-key`.

## Scripts and ports

| Script | What it does | Ports |
|---|---|---|
| `npm run dev` | Development server | 3200 |
| `npm run build` | Production build (works with or without the API) | — |
| `npm start` | Production server for a build | 3200 |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) | — |
| `npm run typecheck` | `tsc --noEmit` | — |
| `npm run fixtures` | Fixture dashboard API (test data, test-only) | 3299 |
| `npm run test:build` | Starts the fixture API, runs `next build` against it, stops it | 3299 |
| `npm run test:e2e` | Playwright: starts the fixture API and `next start`, runs unit + e2e + outage tests | 3200, 3299 |
| `npm test` | `test:build` then `test:e2e` | 3200, 3299 |
| `npm run screenshots` | Full-page screenshots at 4 widths + states → `screenshots/` (needs a test build) | 3200, 3299 |
| `npm run compare` | Side-by-side GHL version vs this app → `screenshots/compare/` | — |

The first time, install the Playwright browser: `npx playwright install chromium`.

## How each page gets its data

All reads go through `src/lib/api.ts` (`getSite()`, `getProducts()`, `getProduct(slug)`), which returns `{ ok: true, data }` or `{ ok: false, reason: "not_configured" | "unavailable" | "not_found" }` and never throws into rendering.

| Page | Data | Rendering |
|---|---|---|
| Layout (header, footer, theme) | `/site`: business name, tagline, logo, colours, phone, email, address, first 3 branches with hours | per page |
| `/` | `/site` (hero copy, services, about copy + values, branches, FAQs) + `/products` (hero art = first 3 eyewear products with images; "Eyewear" = first 8 frames then sunglasses; stats = branches, frames + sunglasses count, first service's duration) | ISR, 60 s |
| `/eyewear` | `/products` (all), `/site` categories (pills with counts), tax note; filtering in the browser, URL state `?category=&q=` | per request (so filtered links arrive pre-filtered), data cached 60 s |
| `/eyewear/[slug]` | `/products/:slug` (variants, per-branch availability, related) + `/site` (services for the booking button, branches for the form) | generated on first visit, ISR 60 s; unknown slug → 404 |
| `/services` | `/site` services ("Appointments") and `inBranchServices` ("In branch", hidden when empty) | ISR, 60 s |
| `/book` | `/site` branches, services (+ `calendars`), `booking.widgetBase`; deep links `?branch=<id or code>&service=<code>` | per request, data cached 60 s |
| `/contact` | `/site` business contact details and branches; the form works even if those can't load | ISR, 60 s |
| `/about` | `/site` about title/body, values, branches | ISR, 60 s |
| `/faq` | `/site` FAQs + FAQPage JSON-LD | ISR, 60 s |
| `/privacy`, `/terms` | `/site` legal name, privacy email, currency/tax; draft text with a visible "Draft — needs legal review" notice (`LEGAL_DRAFT`) | ISR, 60 s |
| `/booking-confirmed`, `/thank-you` | `/site` name/phone (noindex) | ISR, 60 s |

Settings the API doesn't provide (navigation labels, promo banner, social links, testimonials, reply time, legal draft flag) are small typed constants in `src/lib/site-settings.ts`. Testimonials are sample text and **disabled by default**: to enable, replace the items with real reviews you may publish, set `sample: false` and `enabled: true`.

## Caching and revalidation

- API responses are cached for **60 seconds** and tagged `site` (the `/site` response) or `catalog` (`/products`, `/products/:slug`); ISR pages regenerate at most every 60 s.
- **On-demand:** the dashboard calls `POST /api/revalidate` after it changes products, prices, stock or website settings:
  ```http
  POST /api/revalidate
  Authorization: Bearer <REVALIDATE_SECRET>        (x-revalidate-secret: <secret> also accepted)
  Content-Type: application/json

  {"tags":["site","catalog"]}                      (any non-empty subset)
  ```
  Responses: `200 {"revalidated":[...]}`, `401` bad/missing secret, `400` unknown or missing tags. The secret is compared in constant time (SHA-256 of both sides + `timingSafeEqual`). Each tag is revalidated with `revalidateTag(tag, { expire: 0 })` (Next.js 16 requires a profile; `expire: 0` makes the next visit render fresh data instead of serving the stale copy once more).
- **Outages:** if a 60-second refresh fails, the last good data keeps being served (the failure is not cached). Only when there is no good copy — a first deployment while the dashboard is down, or an on-demand revalidation during an outage — does a page show the friendly "temporarily unavailable" state; it retries on the next request. `next build` never fails because the API is unreachable.
- `GET /api/health` → `{ "status": "ok", "api": "ok" | "unconfigured" | "unreachable" }` (uncached, no secrets).

## Forms, inquiries and booking (GoHighLevel)

- **Inquiry form** (contact page, product "Ask about this", booking requests): the browser posts JSON to this site's `POST /api/inquiry`. The route validates it (zod, the same rules as the dashboard), drops honeypot submissions (`website` filled → `201`, nothing forwarded), applies a first-line in-memory limit of 5 per minute per IP, and forwards it server-to-server to the dashboard's `POST /api/public/v1/inquiries` with the site key and `X-Client-IP`. Responses are mapped to friendly messages (field errors, "please wait", "please call us"); bodies over 16 KB get `413`. The dashboard creates or updates a lead and syncs it to GHL.
- **Product inquiries** send `kind: "product_inquiry"` and `productName: "Name (variant)"`. There is **no checkout**: product pages say "Online ordering isn't available yet — we'll reserve it for you to try in branch."
- **Booking:** when the chosen service has a GHL calendar for the chosen branch (`service.calendars` from the dashboard's GHL mapping), `/book` shows GHL's official booking widget (`<iframe src="{booking.widgetBase}{calendarId}">` + `https://link.msgsndr.com/js/form_embed.js`). GHL handles availability, the booking and confirmations; set the calendar's confirmation redirect to `<SITE_URL>/booking-confirmed`. **Without a mapped calendar**, the page says online booking for that branch isn't connected yet and shows an appointment-request form (`kind: "appointment_request"`) — this creates a lead, not an appointment, and says staff will call to confirm a time. Calendar IDs are never invented by the site.

## Security

- Server-only data layer (`import "server-only"`), no `NEXT_PUBLIC_` variables; tests grep the client bundles and rendered HTML for the key, the secret, `Bearer` and the env names.
- Headers (`next.config.ts`): Content-Security-Policy (self; `'unsafe-inline'` scripts because statically generated pages can't use nonces; GHL frames and embed script only; images from https and the dashboard origin), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS; `poweredByHeader: false`.
- `/api/inquiry` rejects cross-origin browser posts and oversized bodies; `/api/revalidate` needs the secret.

## Tests

`npm test` builds against the fixture API and runs Playwright (Chromium):

- **unit**: URL normalisation, theme contrast, hours/open status, prices, catalogue mapping;
- **site**: every page at 390/768/1280/1920 px (HTTP 200, no overflow, no console errors including CSP, exactly one h1, images load, internal links resolve); header and mobile menu keyboard behaviour; catalogue filters/search/URL state/empty state/no-JS deep link; product variants, availability and branches, inquiry success (fixture log checked for `kind`, `productName` with variant, `X-Client-IP`), client and server validation errors; contact form, dashboard 429/502 handling, honeypot, per-IP limit, cross-origin and size limits; booking widget src, setup state and appointment request; FAQ JSON-LD, legal draft notice, titles, robots/noindex, sitemap, security headers; `/api/revalidate` (401/400/200) and `/api/health`; axe WCAG 2.2 AA (serious/critical fail) on every page at mobile and desktop plus open-menu/form-error/request-form states; no secrets in client output;
- **outage** (runs last, alone): the fixture API returns 503 → after an on-demand revalidation every page renders a friendly state without crashing, then recovers; and when a 60-second refresh fails the last good data keeps being served.

The fixture API (`tests/fixtures/api-server.mjs`) serves contract-shaped data generated from the old sample business (3 branches, 3 services of which one has a calendar for one branch, in-branch services, 6 categories, 37 products with in-stock / low / out / made-to-order availability), checks the bearer key, records inquiries to `tests/.tmp/inquiries.json`, and can be switched to 503 via `POST /__control`.

**What the tests do not prove:** they run against fixture data, not the real dashboard, and GHL requests are stubbed. The live booking widget, the GHL CRM sync and a real Vercel deployment have not been exercised from this repository.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short: a separate Vercel project for this repository, the environment variables above (production and preview), no `NEXT_PUBLIC_` secrets, and the dashboard configured with this site's revalidate URL and secret.
