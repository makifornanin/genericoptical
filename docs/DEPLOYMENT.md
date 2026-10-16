# Deployment

## Requirements

- Node.js 22 or newer.
- PostgreSQL 15 or newer, with permission to create the `btree_gist` extension. Migration `0001` enables it; it is available on Neon, Supabase, RDS and Cloud SQL. It enforces "one practitioner, one appointment at a time" in the database.
- HTTPS in front of the app. Session cookies are `Secure` when `NODE_ENV=production`.

## Steps

```bash
npm ci
# set the environment (below) for the target environment
npm run db:migrate          # run on every release, before starting the new version
npm run build
npm start                   # or deploy the build to your platform
DEMO_MODE=false npm run setup:business -- --name "…" --owner-email … --owner-name "…"
```

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Use the provider's **pooled** connection string on serverless hosts. |
| `APP_SECRET` | yes | 32+ random characters. Encrypts stored integration credentials. If you rotate it, stored GoHighLevel tokens can no longer be decrypted and must be re-entered. |
| `APP_URL` | yes | The dashboard origin, e.g. `https://app.clearoptics.ph`. Used in reset links, the OAuth redirect and webhook URLs. |
| `DEMO_MODE` | yes in production | Must be **`false`**. When it is `false`, the demo banner, demo accounts and the demo reset tool are unavailable, and the seed script refuses to run. |
| `SITE_BUSINESS_SLUG` | optional | Which business's name and colours the sign-in page shows. Without it, the first non-demo business is used. |
| `PUBLIC_WEBSITE_URL` | optional (build time) | The customer website (separate project). When set, old public paths (`/book`, `/contact`, …) redirect there; otherwise they return 404. |
| `WEBSITE_REVALIDATE_URL`, `WEBSITE_REVALIDATE_SECRET` | optional | Refresh the customer website right after product and settings changes (`https://<website>/api/revalidate`; the secret equals the website's `REVALIDATE_SECRET`). Without them the website refreshes within 60 seconds. |
| `GHL_WIDGET_BASE` | optional | GHL booking-widget base for white-label domains (default `https://api.leadconnectorhq.com/widget/booking/`). |
| `CRON_SECRET` | if GoHighLevel is used | Enables the sync worker. Call `POST /api/integrations/ghl/process` every 1–5 minutes, and `…?reconcile=1` hourly. Also unlocks detailed `/api/health`. |
| `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET` | for OAuth | From the GHL marketplace app. Server-side only. See GHL_SETUP_GUIDE.md. |
| `GHL_REDIRECT_URI`, `GHL_MARKETPLACE_URL` | optional | Override the OAuth redirect, or use the white-label marketplace host. |
| `TRUST_PROXY_HOPS` | optional | How many proxies append to `X-Forwarded-For` (default 1). Used for sign-in throttling by IP. |
| `LOG_LEVEL` | optional | `debug`, `info` (default), `warn` or `error`. Logs are JSON lines with secrets redacted. |
| `UPLOAD_DIR` | optional | Expense receipt storage on local disk (default `.data/uploads`). It must be a persistent volume. |

## Hosting notes

- **Single server, VM or container** (recommended for this build): run `npm start` behind a reverse proxy, with `UPLOAD_DIR` on a persistent volume and PostgreSQL managed separately.
- **Vercel** (staging is deployed here: project `optical-management-dashboard`; see [CREDENTIALS_SETUP.md](CREDENTIALS_SETUP.md)):
  - `vercel.json` sets the Next.js preset, Singapore functions (`sin1`) and a daily cron for the GHL worker. Hobby plans allow daily crons only. Actions still run the worker immediately after each change, so the cron is a recovery fallback. On Pro, use `*/5 * * * *`.
  - The build doesn't need the database.
  - Receipt uploads are refused on Vercel until an object-storage adapter replaces `src/server/storage.ts` (local disk there is temporary).
  - `.vercelignore` keeps `.data/`, env files and test artefacts out of uploads.
  - Database setup, migrations and backups: [PRODUCTION_DATABASE.md](PRODUCTION_DATABASE.md).
- **Several instances**: login throttling, public-API rate limits, and every idempotency and sync guarantee are stored in PostgreSQL, so they work across instances.
- **Customer website**: a separate Next.js project (`optical-customer-website`). It reads `/api/public/v1` with a site key ([PUBLIC_API.md](PUBLIC_API.md)) and never connects to PostgreSQL.
- **Backups**: rely on the database provider's point-in-time recovery. Financial records are never hard-deleted by the app, so a restore is the only way data disappears.

## Checks after a deploy

- `GET /api/health` returns `{"status":"ok","database":"ok"}`, or 503 if the database is unreachable.
- With `Authorization: Bearer $CRON_SECRET` it also returns `migrations.pending` (must be 0) and the sync backlog. It returns 503 if migrations are missing.
- `/robots.txt` disallows everything, and `/` redirects to the dashboard.
- `/app` redirects to `/login` when signed out.
- Response headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` (set in `next.config.ts`).
- Optional: run the Playwright suite against a staging copy that has the demo seeded: `E2E_BASE_URL=https://staging… npm run test:e2e`. Never point it at production; it creates records.

For the full pre-production checklist (what is verified, what isn't, and the go/no-go conditions), see [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md).
