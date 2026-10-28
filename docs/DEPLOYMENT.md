# Deploying to Vercel

This website is its **own Vercel project**, separate from the dashboard.

**Staging (deployed 2026-10-16):**
- **Project:** `optical-customer-website` in the "maki's projects" team, deployed from the CLI (no Git integration yet).
- **URL:** https://optical-customer-website.vercel.app
- **Region:** Singapore (`sin1`, in `vercel.json`).
- **Environment set:** `DASHBOARD_API_URL` (https://optical-management-dashboard.vercel.app), `REVALIDATE_SECRET`, `SITE_URL`, `SITE_NOINDEX=1`.
- **Missing:** `DASHBOARD_SITE_KEY`. It can only be created once the dashboard has a database. Until then every page shows the "Setup needed" state.
- **Redeploy:** `vercel deploy --prod` from this folder.

The steps below describe setting up a project from scratch, for reference.

## 1. Create the project

1. Vercel → **Add New → Project** → import this repository.
2. Framework preset: **Next.js** (detected). Root directory: the repository root. Build command `next build` (default), output: default. Node.js 20.9 or later (22 or 24 recommended).
3. Don't enable anything that injects scripts into pages (analytics, toolbar) without updating the Content-Security-Policy in `next.config.ts`.

## 2. Environment variables

Settings → Environment Variables. Add them for **Production** and **Preview** (preview deployments should use a separate site key, ideally for a demo business):

| Name | Value |
|---|---|
| `DASHBOARD_API_URL` | The dashboard's public URL, e.g. `https://dashboard.example.com` |
| `DASHBOARD_SITE_KEY` | A site key created in the dashboard: **Settings → Website → Website API keys → New key** (shown once), or `npm run site-key -- create --business <slug> --name "Customer website"` |
| `REVALIDATE_SECRET` | A long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — the same value goes into the dashboard's website settings |
| `SITE_URL` | The site's public URL, e.g. `https://www.example-optical.com` |
| `SITE_NOINDEX` | `1` for previews/staging (optional; automatic for a demo business) |
| `CSP_EXTRA_FRAME_SRC` | Only for a white-label GHL booking domain, e.g. `https://bookings.youragency.com` |

Rules:
- **Never prefix these with `NEXT_PUBLIC_`.** They are read only on the server; a `NEXT_PUBLIC_` variable is inlined into the browser bundle.
- Mark `DASHBOARD_SITE_KEY` and `REVALIDATE_SECRET` as **Sensitive** in Vercel.
- `DASHBOARD_API_URL` must be present **at build time**: the Content-Security-Policy is computed during `next build`. Changing it needs a redeploy.
- Changing any variable needs a redeploy to take effect.

## 3. Connect the dashboard

In the dashboard (Settings → Website / integrations — being built in parallel):
- the site key's business decides which business the website shows;
- set the website's revalidate URL to `https://<site>/api/revalidate` and the secret to `REVALIDATE_SECRET`. The dashboard calls it with `Authorization: Bearer <secret>` and `{"tags":["site","catalog"]}` after changes;
- the dashboard API must be reachable from Vercel's servers (the browser never calls it, and it sends no CORS headers).

## 4. GoHighLevel

- **The embeds** (inquiry form, booking calendar and Conversation AI chat) are the business's own, set in `src/lib/ghl.ts`. See the README's "GoHighLevel embeds". Changing one means editing that file and redeploying, and the CSP follows automatically.
- **Inquiries** from the contact page go straight to GoHighLevel through its form. Orders go to the dashboard, which syncs them to GHL as opportunities. The website never calls GHL's API itself.
- **Calendars:** if the dashboard maps calendars to services and branches (Settings → Integrations → GoHighLevel), the eye-exam page uses those first.
- **After booking:** set where GHL sends people once they've booked in the calendar's own settings. This site has no "booking confirmed" page; the home page is a sensible target.

## 5. Check the deployment

1. `https://<site>/api/health` → `{"status":"ok","api":"ok"}`. `"unconfigured"` = missing/rejected site key; `"unreachable"` = the dashboard can't be reached.
2. Open every page; the header shows the business name (no "Setup needed" notice).
3. Send a test inquiry from `/contact` and find the lead in the dashboard (and in GHL once synced).
4. `/book` with a mapped calendar shows the GHL widget; the browser console shows no CSP errors.
5. Change a product price in the dashboard; the site should show it on the next visit after the dashboard calls `/api/revalidate` (or within about 60 seconds otherwise).
6. `robots.txt` disallows everything while the business is a demo or `SITE_NOINDEX=1`.

## Caching on Vercel

- ISR pages and the cached API responses live in Vercel's data cache; `revalidateTag` from `/api/revalidate` invalidates them across the deployment.
- `/eyewear` and `/book` render per request (their URL parameters change the HTML); the API data behind them is still cached for 60 seconds.
- The first-line rate limit in `/api/inquiry` is per serverless instance (in memory); the durable limits are enforced by the dashboard. `x-forwarded-for` / `x-real-ip` are set by Vercel, so the visitor IP forwarded to the dashboard (`X-Client-IP`) is trustworthy there. If you self-host, put the app behind a proxy that overwrites these headers.

## Custom domain

Vercel → Domains → add the domain, then update `SITE_URL` and redeploy.
