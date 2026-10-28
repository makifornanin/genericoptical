# Specta: white-label optical business platform

A staff dashboard for an optical shop or eye clinic: POS, customer orders, inventory, purchasing, CRM, appointments, expenses, reports and staff permissions. Everything is stored in PostgreSQL, and every permission is checked on the server.

The customer-facing website, forms, booking and marketing run on **GoHighLevel**. The dashboard connects to each business's GHL sub-account and stays the source of truth for stock, sales, payments and fulfilment. The original website is archived in [customer-website-reference/](customer-website-reference/README.md), with a GHL migration guide.

It is white-label: name, logo, colours, tax, currency, hours, branches and services are all settings. Nothing about a specific business is hard-coded.

- Architecture and data rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Design research and design system: [docs/DESIGN.md](docs/DESIGN.md)
- GoHighLevel:
  - [architecture and data ownership](docs/GHL_ARCHITECTURE.md)
  - [API capability matrix](docs/GHL_API_CAPABILITY_MATRIX.md)
  - [setup guide](docs/GHL_SETUP_GUIDE.md)
  - [test plan](docs/SYNC_TEST_PLAN.md)
- Payments and email: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- Deploying to production: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and the readiness audit [docs/DEPLOYMENT_READINESS.md](docs/DEPLOYMENT_READINESS.md)
- What's finished and verified: [docs/STATUS.md](docs/STATUS.md) (Phase 1) and [docs/PHASE2_STATUS.md](docs/PHASE2_STATUS.md)
- Bugs found and fixed in Phase 2: [docs/BUG_AUDIT.md](docs/BUG_AUDIT.md)

## Quick start (demo)

Requirements: Node.js 22+ and npm. Docker is not needed, because a real PostgreSQL server is bundled for local use.

```bash
npm install
cp .env.example .env.local        # then set APP_SECRET (command is in the file)
npm run db:start                  # terminal 1: PostgreSQL on port 54329, data in .data/postgres
npm run db:migrate                # terminal 2
npm run db:seed                   # demo business: ~9 months of interconnected records
npm run dev                       # http://localhost:3000
```

- Staff dashboard: http://localhost:3000 (redirects to sign-in). Demo accounts are listed on the login page (password `Lensmere-demo-2026`): owner, manager, sales, inventory and optometrist.

The demo business, *Lensmere Optical*, is fictional. Its names, phone numbers and prescriptions are generated, and no real patient data is used. When `DEMO_MODE=true`, the owner can rebuild it from **Settings → Demo data**, or you can run `npm run db:reset-demo`. Both refuse to run unless `DEMO_MODE=true`, and they only delete businesses flagged as demo.

## Setting up a real business

There is no public sign-up. Create each business and its first owner from the command line:

```bash
DEMO_MODE=false npm run setup:business -- --name "Clear Optics" --owner-email ana@clearoptics.ph --owner-name "Ana Cruz" --branch "Makati" --branch-code MKT
```

This creates the business, one branch with its stockroom, default product categories, appointment types and expense categories, and an owner account. A temporary password is printed once; set `OWNER_PASSWORD` to choose it instead.

Then sign in and complete **Settings**: branding, tax, hours, branches and appointment prices. After that:
- add staff under **Staff**;
- add products under **Products**, or import them with **Products → Import CSV**;
- connect GoHighLevel under **Settings → Integrations** (see [docs/GHL_SETUP_GUIDE.md](docs/GHL_SETUP_GUIDE.md)).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:start` | Local PostgreSQL 18 (embedded, persistent) |
| `npm run db:migrate` | Apply SQL migrations in `drizzle/` |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:seed` / `npm run db:reset-demo` | Create / rebuild the demo business (`DEMO_MODE=true` only) |
| `npm run setup:business -- …` | Create a real business and its owner |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm test` | Unit, database and component tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the seeded demo |

### Tests

- `npm test` starts its own throwaway PostgreSQL instance, so it doesn't need `db:start` and never touches your data. The `db` project runs the services against real PostgreSQL. It covers:
  - concurrency (last-unit checkout, retried payments, double-booking);
  - tenant isolation, permissions and financial calculations;
  - the GoHighLevel integration, against a simulated GHL API (`tests/db/ghl-fake.ts`);
  - a regression test for each bug fixed in Phase 2;
  - demo-data reconciliation.
- `npm run test:e2e` needs the seeded demo database (`db:start` + `db:reset-demo`). It reuses a running dev server or starts one. Point `E2E_BASE_URL` at another server (for example a production build on port 3100) to test that instead. The tests create uniquely named records, so they can be re-run without reseeding. Run `npx playwright install chromium` once beforehand.

## Environment

See [.env.example](.env.example) (placeholders only).
- **Required:** `DATABASE_URL`, `APP_SECRET` (32+ characters; encrypts stored integration credentials), `APP_URL`.
- **Optional:** `DEMO_MODE`, `SITE_BUSINESS_SLUG`, `PUBLIC_WEBSITE_URL`, `UPLOAD_DIR`, `CRON_SECRET`, `TRUST_PROXY_HOPS`, `LOG_LEVEL`, and the GoHighLevel app settings (`GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_REDIRECT_URI`, `GHL_MARKETPLACE_URL`).
