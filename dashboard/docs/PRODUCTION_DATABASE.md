# Databases: staging and production

## Current setup

| Environment | Database | Data | Notes |
|---|---|---|---|
| Development (your PC) | Embedded PostgreSQL 18 on `localhost:54329`, files in `.data/postgres` (`npm run db:start`) | Demo business "Lensmere Optical" | Never use this as a hosted database. It isn't backed up, and it lives on one PC. |
| Automated tests | Throwaway PostgreSQL on `localhost:54339`, created and deleted by each `vitest` run | Fixtures per test | Fully isolated. |
| **Staging (Vercel)** | **Neon** project `frosty-rain-06210397`, branch `production`, AWS Singapore (`ap-southeast-1`), database `neondb`. Connected 2026-10-16 through `DATABASE_URL` / `DATABASE_URL_UNPOOLED` on `optical-management-dashboard`. | Demo data only | Migrated and loaded during the Vercel build (below). |
| Production | Not created. Don't create it until staging has been reviewed. | The real business only | A separate database from staging. |

Keep these four separate. Never point staging or tests at the production database, and never copy production data into staging.

## Why Neon, and which region

- **Neon** is serverless PostgreSQL with a pooled endpoint built for Vercel functions, point-in-time restore, and branches (instant copies for testing a migration). It supports the `btree_gist` extension, which the migrations enable to stop double-booking practitioners.
- **Region:** choose **AWS Asia Pacific (Singapore)**. Both Vercel projects run their functions in Singapore (`"regions": ["sin1"]` in `vercel.json`), close to the business in the Philippines.
- **Alternatives:** any managed PostgreSQL 15+ with `btree_gist` works (Supabase, RDS, Cloud SQL). Use its pooled connection string.

## Creating the staging database (needs your account)

Adding Neon requires accepting Neon's terms, so you have to do it yourself. Pick one of these two:

1. **Through Vercel:** Vercel → team "maki's projects" → **Storage** (Marketplace) → **Neon** → create a database in Singapore → connect it to **`optical-management-dashboard`** only.
   - Vercel then adds `DATABASE_URL` (pooled) and related variables to the project.
   - Connect it to the production environment of that project, which *is* the staging project.
2. **Directly at neon.tech:** create a project called `optical-staging` in Singapore. Then copy:
   - the **pooled** connection string (host contains `-pooler`) into Vercel → `optical-management-dashboard` → Settings → Environment Variables → `DATABASE_URL` (Sensitive, Production);
   - the **direct** connection string, for running migrations from your PC (next section).

Don't connect the database to the website project: the website never talks to PostgreSQL.

## How staging was prepared (and how to repeat it)

Vercel keeps Production variables **sensitive**: `vercel env pull` returns empty values, so the database can't be reached from a developer machine. The dashboard's `vercel-build` script therefore runs `scripts/vercel-db-setup.ts` before `next build`, on every deploy:

1. It logs the target (region and database name only, never the connection string) and what it finds.
2. It applies pending migrations, using `DATABASE_URL_UNPOOLED`, or `DATABASE_URL` if that is missing.
3. It loads the demo **only if** `DEMO_MODE=true`, the upload contains `.demo-snapshot/demo.json.gz`, **and** the database has no businesses. Otherwise it changes nothing.

To (re)create the snapshot locally:
- run `npm run db:reset-demo`, then `npm run db:snapshot`;
- it exports the demo only: no sessions, sign-in attempts, reset or OAuth tokens, API keys or rate counters;
- it is git-ignored and was deleted after the first load.

First run on 2026-10-16:
- Neon was empty (0 tables);
- 11 migrations were applied;
- 33,990 demo rows were loaded;
- the app's integrity check passed on a rehearsal copy.

### Manual alternative (from your PC, in `generic eye/`)

Run these with the **direct** (non-pooled) connection string in the command's environment. Don't save it in a file in the repository.

```bash
# 1. Create the schema (safe to re-run; applies only migrations that are missing)
DATABASE_URL="<direct connection string>" npm run db:migrate

# 2. Load the demo business (refuses to run unless DEMO_MODE=true; only touches demo businesses)
DATABASE_URL="<direct connection string>" DEMO_MODE=true npm run db:seed
```

Then:

3. Redeploy the dashboard (`vercel deploy --prod` in `generic eye/`, or Redeploy in the Vercel UI). Check that `https://optical-management-dashboard.vercel.app/api/health` returns `{"status":"ok","database":"ok"}`.
4. Sign in as the demo owner and open **Settings → Website → Website API keys → New key**. Paste the key into the website project's `DASHBOARD_SITE_KEY` (Sensitive), then redeploy the website.
5. Check that https://optical-customer-website.vercel.app shows the demo catalogue instead of "Setup needed".

**Staging is a public demo:** the sign-in page lists the demo accounts while `DEMO_MODE=true`. Before connecting a **real** GHL sub-account to staging, either:
- set `DEMO_MODE=false` and change every demo user's password; or
- connect only a GHL test sub-account.

Otherwise anyone could create contacts in your real GHL account through the demo.

## Production (later, after review)

1. Create a **separate** Neon project (`optical-production`, Singapore) on a paid plan with a restore window you're comfortable with.
2. Apply migrations: `DATABASE_URL="<prod direct>" npm run db:migrate`.
3. Create the real business and its owner. Never use the demo seed:
   ```bash
   DATABASE_URL="<prod direct>" DEMO_MODE=false npm run setup:business -- --name "…" --owner-email … --owner-name "…"
   ```
4. Use a separate Vercel project, or the same project with `DEMO_MODE=false` and production values, plus its own `APP_SECRET`, `CRON_SECRET` and site key.

## Applying future migrations safely

- Migrations are SQL files in `drizzle/`, generated by `npm run db:generate` and applied in order by `npm run db:migrate`, which records what has run. Read new SQL before applying it to production.
- Before migrating production:
  - create a **Neon branch** (or note the time for point-in-time restore);
  - run the migration against the branch first;
  - then run it against production;
  - then deploy the app version that needs it.
- `/api/health`, called with `Authorization: Bearer <CRON_SECRET>`, reports `migrations.pending`, which must be 0 after a release.

## Protecting real records

- The app never hard-deletes financial records: sales, payments, refunds and stock movements are append-only or marked cancelled or voided, and every change is audited.
- `npm run db:seed` and the demo reset refuse to run unless `DEMO_MODE=true`, and they delete only businesses flagged `is_demo`.
- Tests use their own throwaway database. Never set `E2E_BASE_URL` to production: the Playwright suite creates records.

## Backups and recovery

- **Point-in-time restore (Neon):** restore to a timestamp by creating a branch from that point. Check it, then point `DATABASE_URL` at it, or restore over the main branch. The window depends on your Neon plan, so check it in the Neon console and size it for production.
- **Logical backups (recommended in addition):** run a scheduled `pg_dump` to storage you control:
  ```bash
  pg_dump --format=custom --no-owner "<direct connection string>" > optical-$(date +%F).dump
  # restore into an EMPTY database:
  pg_restore --no-owner --dbname "<target direct connection string>" optical-YYYY-MM-DD.dump
  ```
- **Recovery drill** (do it once before go-live):
  1. Restore yesterday's backup into a new branch.
  2. Point a preview deployment at it.
  3. Sign in and compare totals on Reports with production.
- **Secrets:** keep `APP_SECRET` with your backups, for example in a password manager. Stored GHL tokens are encrypted with it and can't be decrypted without it.
