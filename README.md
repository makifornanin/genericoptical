# Specta: white-label optical business platform

One app for an optical shop or eye clinic: a public website with lead capture and online booking, plus a staff dashboard for POS, customer orders, inventory, purchasing, CRM, appointments, expenses, reports and staff permissions. Everything is stored in PostgreSQL, and every permission is checked on the server.

It is white-label: name, logo, colours, tax, currency, hours, branches, services and website copy are all settings. Nothing about a specific business is hard-coded.

- Architecture and data rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Design research and design system: [docs/DESIGN.md](docs/DESIGN.md)
- GoHighLevel, payments and email: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- Deploying to production: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- What's finished, what's verified and known limitations: [docs/STATUS.md](docs/STATUS.md)

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

- Public website: http://localhost:3000
- Staff dashboard: http://localhost:3000/login. Demo accounts are listed on the login page (password `Lensmere-demo-2026`): owner, manager, sales, inventory and optometrist.

The demo business, *Lensmere Optical*, is fictional. Its names, phone numbers and prescriptions are generated, and no real patient data is used. When `DEMO_MODE=true`, the owner can rebuild it from **Settings → Demo data**, or you can run `npm run db:reset-demo`. Both refuse to run unless `DEMO_MODE=true`, and they only delete businesses flagged as demo.

## Setting up a real business

There is no public sign-up. Create each business and its first owner from the command line:

```bash
DEMO_MODE=false npm run setup:business -- --name "Clear Optics" --owner-email ana@clearoptics.ph --owner-name "Ana Cruz" --branch "Makati" --branch-code MKT
```

This creates the business, one branch with its stockroom, default product categories, appointment types and expense categories, and an owner account. A temporary password is printed once; set `OWNER_PASSWORD` to choose it instead. Then sign in and complete **Settings**: branding, tax, hours, branches, appointment prices and website copy. After that, add staff under **Staff** and products under **Products**, or import them with **Products → Import CSV**.

Set `SITE_BUSINESS_SLUG` to the slug the command prints, so the public website serves that business.

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

- `npm test` starts its own throwaway PostgreSQL instance, so it doesn't need `db:start` and never touches your data. The `db` project runs the services against real PostgreSQL. It covers concurrency (last-unit checkout, retried payments, double-booking), tenant isolation, permissions, financial calculations, GoHighLevel webhook and outbox behaviour, and demo-data reconciliation.
- `npm run test:e2e` needs the seeded demo database (`db:start` + `db:reset-demo`). It reuses a running dev server or starts one. Point `E2E_BASE_URL` at another server (for example a production build on port 3100) to test that instead. The tests create uniquely named records, so they can be re-run without reseeding. Run `npx playwright install chromium` once beforehand.

## Environment

See [.env.example](.env.example). Required: `DATABASE_URL`, `APP_SECRET` (32+ characters; encrypts stored integration credentials), `APP_URL`. Optional: `DEMO_MODE`, `SITE_BUSINESS_SLUG`, `UPLOAD_DIR`, `CRON_SECRET`.
