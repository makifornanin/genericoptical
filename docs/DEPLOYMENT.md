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
| `APP_URL` | yes | The public origin, e.g. `https://clearoptics.ph`. Used in reset links, webhook URLs and the sitemap. |
| `DEMO_MODE` | yes in production | Must be **`false`**. When it is `false`, the demo banner, demo accounts and the demo reset tool are unavailable, and the seed script refuses to run. |
| `SITE_BUSINESS_SLUG` | recommended | Which business the public website shows. Without it, the first non-demo business is used. |
| `CRON_SECRET` | if GoHighLevel is used | Enables `POST /api/integrations/ghl/process`. Schedule it every few minutes. |
| `UPLOAD_DIR` | optional | Expense receipt storage on local disk (default `.data/uploads`). It must be a persistent volume. |

## Hosting notes

- **Single server, VM or container** (recommended for this build): run `npm start` behind a reverse proxy, with `UPLOAD_DIR` on a persistent volume and PostgreSQL managed separately.
- **Vercel or another serverless host**: pages, actions and API routes work as they are, but the local-disk receipt storage does not persist. Replace `src/server/storage.ts` with an object-storage adapter (S3, R2, Vercel Blob) before enabling receipt uploads. Use a Vercel Cron job for the GoHighLevel endpoint.
- **Several instances**: the public-form rate limiter is in memory, per instance. Add an edge or WAF rate limit (or a shared store) for `/contact` and `/book` submissions. Login throttling is stored in the database, so it already works across instances.
- **Backups**: rely on the database provider's point-in-time recovery. Financial records are never hard-deleted by the app, so a restore is the only way data disappears.

## Checks after a deploy

- `GET /api/health` returns `{"status":"ok","database":"ok"}`, or 503 if the database is unreachable.
- `/app` redirects to `/login` when signed out.
- Response headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` (set in `next.config.ts`).
- Optional: run the Playwright suite against a staging copy that has the demo seeded: `E2E_BASE_URL=https://staging… npm run test:e2e`. Never point it at production; it creates records.
