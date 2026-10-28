# Credentials and configuration

Every value the two apps need: what it's for, where to get it, which app it belongs to, whether it's secret, and whether it's needed now or later.

**Never paste a secret into chat, email, a ticket or a commit.** Enter secrets only:
- in Vercel → *Project* → **Settings → Environment Variables**, marked **Sensitive**; or
- in the dashboard (Settings screens), where they're encrypted with `APP_SECRET`.

To generate a random secret on your own machine:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## The two Vercel projects (staging)

| App | Vercel project | URL | Repository |
|---|---|---|---|
| Management dashboard | `optical-management-dashboard` | https://optical-management-dashboard.vercel.app | `generic eye/` |
| Customer website | `optical-customer-website` | https://optical-customer-website.vercel.app | `optical-customer-website/` |

Both are isolated staging projects in the "maki's projects" team, deployed from the CLI; no GitHub repository is connected yet. They run with demo data only. Search engines are blocked on the website (`SITE_NOINDEX=1`, `robots.txt`) and on the dashboard (`robots.txt`).

**Status key:**
- ✅ already set on staging
- ⛔ required now (blocks the live catalogue)
- 🕒 needed tomorrow (GHL setup)
- ➖ optional

## Dashboard: Vercel environment variables (`optical-management-dashboard`)

| Variable | Purpose | Where to get it | Secret | Status |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection for the app. Use the provider's **pooled** connection string. | Neon project → Connection details → *Pooled connection*. See [PRODUCTION_DATABASE.md](PRODUCTION_DATABASE.md). | Yes | ✅ set (Neon, Singapore) |
| `DATABASE_URL_UNPOOLED` | Direct connection, used by the build-time migrations and the demo load (`scripts/vercel-db-setup.ts`). | Neon → Connect → direct connection string. | Yes | ✅ set |
| `APP_SECRET` | Encrypts stored GHL tokens (AES-256-GCM) and signs reset links. Never rotate it casually: stored GHL credentials would have to be re-entered. | Generated. | Yes | ✅ generated and set |
| `APP_URL` | The dashboard's public origin, used for links, the OAuth redirect, webhook URLs and absolute product image URLs in the public API. | The Vercel URL above, or your custom domain later. | No | ✅ `https://optical-management-dashboard.vercel.app` |
| `DEMO_MODE` | `true` on staging (demo banner, demo sign-ins on the login page, demo reset). **Must be `false` in production.** | — | No | ✅ `true` |
| `CRON_SECRET` | Authorises the GHL sync worker (`/api/integrations/ghl/process`). Vercel Cron sends it automatically. | Generated. | Yes | ✅ generated and set |
| `TRUST_PROXY_HOPS` | Proxies in front of the app, used for sign-in throttling by IP. | `1` on Vercel. | No | ✅ `1` |
| `WEBSITE_REVALIDATE_URL` | Lets the dashboard refresh the website immediately after product or settings changes. | `https://optical-customer-website.vercel.app/api/revalidate` | No | ✅ set |
| `WEBSITE_REVALIDATE_SECRET` | Shared secret for the call above. **Must equal the website's `REVALIDATE_SECRET`.** | Generated once and set on both projects. | Yes | ✅ set |
| `PUBLIC_WEBSITE_URL` | Build-time redirect for the dashboard's old public paths (`/eyewear`, `/book`, …) to the website. | The website URL. | No | ➖ set when you want the redirects, then redeploy |
| `SITE_BUSINESS_SLUG` | Which business brands the sign-in page. | The business slug. | No | ➖ |
| `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET` | Marketplace app (OAuth) credentials, so businesses can connect GHL with "Connect with GoHighLevel". **Not needed for a Private Integration token.** | HighLevel developer portal → your app → Auth. | Secret: yes | ➖ later; OAuth support is kept |
| `GHL_REDIRECT_URI` | OAuth redirect, if it differs from `<APP_URL>/api/integrations/ghl/oauth/callback`. Must exactly match the app's registered redirect. | Developer portal. | No | ➖ later |
| `GHL_MARKETPLACE_URL` | White-label agencies: `https://marketplace.leadconnectorhq.com`. | — | No | ➖ |
| `GHL_WIDGET_BASE` | Booking-widget base URL if your agency uses a white-label domain. Default `https://api.leadconnectorhq.com/widget/booking/`. | Compare with the embed code GHL gives you (see below). | No | 🕒 only if the embed code uses another domain |
| `GHL_WEBHOOK_ED25519_PUBLIC_KEY`, `GHL_WEBHOOK_RSA_PUBLIC_KEY` | Overrides for HighLevel's published webhook keys. Leave unset; the published keys are built in. | — | No | ➖ |
| `LOG_LEVEL` | `debug`, `info` (default), `warn` or `error`. | — | No | ➖ |

Not applicable on Vercel: `UPLOAD_DIR`. Expense-receipt uploads are refused on Vercel until an object-storage adapter exists, because files saved on Vercel's temporary disk would be lost.

## Dashboard: entered in the app, not in Vercel

| Item | Purpose | Where to get it | Where to enter it | Secret | Status |
|---|---|---|---|---|---|
| GHL **Private Integration token** | Connects one GHL sub-account for testing. It's a static bearer token: it doesn't refresh, so rotate it manually. | GHL sub-account → **Settings → Private Integrations** → create, then choose the scopes listed in [GHL_SETUP_GUIDE.md](GHL_SETUP_GUIDE.md). | Dashboard → **Settings → Integrations → GoHighLevel → Use a Private Integration token**. The token is verified, then stored encrypted and never shown again. | Yes | 🕒 tomorrow |
| GHL **Location (sub-account) ID** | Which sub-account the token belongs to. | GHL → Settings → Business Profile (or the URL `/location/<id>/…`). | Same dialog. | No | 🕒 tomorrow |
| Sales pipeline and stages | Where POS sales and orders appear as opportunities. These are CRM records only, never revenue or payments. | Your GHL pipeline. | Dashboard → Settings → Integrations → **Sync settings & mapping**. | No | 🕒 tomorrow |
| Calendar mapping | Links each GHL calendar to a branch and an appointment type; the website shows the booking widget only where a mapping exists. | Created in GHL. The dashboard reads the calendar list after connecting. | Dashboard → Settings → Integrations → Sync settings & mapping → **Calendars**. | No | 🕒 tomorrow |
| Staff ↔ GHL users | Assigns appointments and opportunities to the right person. | — | Same screen → **Users**. | No | 🕒 optional |
| **Website API key** (`DASHBOARD_SITE_KEY`) | Lets the website read this business's published catalogue and send inquiries. Scoped (`site:read`, `catalog:read`, `inquiries:write`), stored only as a hash, revocable. | Created by the dashboard: shown once. | Dashboard → **Settings → Website → Website API keys → New key**. Copy it straight into the website's `DASHBOARD_SITE_KEY` in Vercel. CLI alternative: `npm run site-key -- create --business <slug>` against the target database. | Yes | ✅ "Customer website (staging)" key created in live Settings and set on the website |

**Webhook (only with the marketplace app / OAuth):** register `https://optical-management-dashboard.vercel.app/api/integrations/ghl/webhooks` in the developer portal. Signature handling follows HighLevel's current guide:
- Requests are verified with **Ed25519 `X-GHL-Signature`**.
- If only the legacy RSA `X-WH-Signature` header arrives, that is checked instead.
- The guide says the legacy header is retired after mid-2026; HighLevel's cached doc versions disagree on the exact date.

A Private Integration token doesn't use these marketplace webhooks.

## Website: Vercel environment variables (`optical-customer-website`)

None of these use the `NEXT_PUBLIC_` prefix: all are server-only and never reach the browser.

| Variable | Purpose | Where to get it | Secret | Status |
|---|---|---|---|---|
| `DASHBOARD_API_URL` | The dashboard's origin. The site adds `/api/public/v1` itself; the full path also works. **Needed at build time** (the Content-Security-Policy is computed during the build). | The dashboard URL. | No | ✅ `https://optical-management-dashboard.vercel.app` |
| `DASHBOARD_SITE_KEY` | Server-to-server key for the dashboard's public API. | Dashboard → Settings → Website → Website API keys. | Yes | ✅ set |
| `REVALIDATE_SECRET` | Protects `POST /api/revalidate`. **Must equal the dashboard's `WEBSITE_REVALIDATE_SECRET`.** | Generated (already shared). | Yes | ✅ set |
| `SITE_URL` | Canonical URL for metadata, sitemap and robots. | The website URL or a custom domain. | No | ✅ `https://optical-customer-website.vercel.app` |
| `SITE_NOINDEX` | `1` keeps search engines out (also automatic while the business is a demo). Remove at launch. | — | No | ✅ `1` |
| `CSP_EXTRA_FRAME_SRC` | Extra allowed frame origin for a white-label GHL booking domain. | The domain in your GHL embed code. | No | 🕒 only if needed |

## What the website does with GHL forms and calendars

- **Forms:** the website's own inquiry, contact and appointment-request forms post to the website server. That server forwards them to the dashboard (`POST /api/public/v1/inquiries`).
  - The dashboard creates or updates a **lead** (source *website*, plus the page it came from).
  - It queues `lead.upsert`. The GHL contact is created with source **"Website"** after searching by email, then phone, so contacts aren't duplicated.
  - **No GHL form IDs are needed**, and none are invented.
  - Native GHL forms aren't embedded. If you want to switch to them, that's a later change.
- **Calendars:** GHL stays the scheduling source of truth.
  - The booking page embeds the **official GHL booking widget** for the calendar mapped to the chosen branch and service.
  - Where nothing is mapped, it says online booking isn't connected yet and offers an appointment *request*. That request creates a lead, not an appointment.
  - Before relying on it, compare the URL in GHL's own embed code (*Calendars → ⋯ → Share → Embed code*) with `https://api.leadconnectorhq.com/widget/booking/<calendarId>`. If GHL shows a different (white-label) domain, set `GHL_WIDGET_BASE` on the dashboard and `CSP_EXTRA_FRAME_SRC` on the website.

**Not verified yet:** none of this has run against a real GHL account. Form-to-contact, the booking widget and calendar sync are tested only against a simulator. Submissions and bookings must be checked with the real account before anyone relies on them.
