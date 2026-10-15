# Deployment readiness audit

**Date:** 2026-10-16. **Branch:** `phase-2`.

**Verdict: not ready for production.** The dashboard is ready for a staging deployment and a supervised pilot with test data. Going live with real customers needs the blocking items below.

- Nothing has been deployed.
- No real customer data has been migrated.
- No production credentials were used.

## Status legend

| Status | Meaning |
|---|---|
| **Ready** | Done, with evidence. |
| **Action** | Work or a decision is needed before going live. |
| **Blocked** | Needs something only the business or operator can provide (credentials, accounts, approvals). |

## 1. Build and tests

| Check | Status | Evidence |
|---|---|---|
| Lint, typecheck | Ready | `npm run lint`: 0 problems. `npm run typecheck`: pass. |
| Unit, database and component tests | Ready | All pass. Counts are in [PHASE2_STATUS.md](PHASE2_STATUS.md). |
| Production build | Ready | `npm run build` passes (43 static/partial pages plus API routes). |
| End-to-end | Ready | 18/18 on the dev server and 18/18 on the production build (`next start`). |
| Demo seed and integrity | Ready | `npm run db:reset-demo`: integrity checks pass. |
| Dependency audit | Ready (prod) / Action (dev) | `npm audit --omit=dev`: 0 vulnerabilities. Dev-only tooling (drizzle-kit, eslint-config-next) has 9 advisories. They aren't shipped, but upgrade them when compatible versions are available. |

## 2. Database

| Check | Status | Notes |
|---|---|---|
| Migrations | Ready | 9 migrations (0000–0008), applied in order by `npm run db:migrate`. `/api/health` (cron bearer) reports `migrations.pending`. |
| Migration 0005 on existing data | Action | It converts the sync-status enum to text and renames `processed` to `synced`. **Run it on a copy of the production database first**, and time it. |
| Integrity constraints | Ready | Non-negative stock, `CHECK` constraints on money, composite tenant foreign keys, a practitioner exclusion constraint, and unique idempotency keys and order ids. |
| Backups / point-in-time recovery | Blocked | Depends on the chosen PostgreSQL host. Enable PITR and test a restore. |
| Real data migration | Blocked | **Not done, and not to be done without explicit approval.** No importer for existing customer records exists beyond the product CSV import. |

## 3. Security

| Check | Status | Notes |
|---|---|---|
| Authentication and sessions | Ready | scrypt hashes; httpOnly Secure cookies; atomic throttling per email and per IP; reset tokens single-use, with others retired. |
| Authorisation and tenancy | Ready | Server-side permission checks in every service; composite foreign keys. The cross-business takeover (B1) and escalation (B3) are fixed and tested. |
| Secrets | Ready | Tokens are encrypted with AES-256-GCM and never returned to the browser. Logs redact keys that look like secrets. `.env.example` holds placeholders only. |
| Webhooks | Ready (code) / Blocked (live) | Ed25519 verification with GHL's published key, capped body, deduplication, staleness limit. Not yet exercised with real GHL deliveries. |
| Client IP behind proxies | Action | Set `TRUST_PROXY_HOPS` to match the real proxy chain. |
| External security review or penetration test | Action | Not done. Recommended before handling patient data at scale. |
| Prescriptions | Action | Access is restricted by role, but there's no field-level encryption. Decide whether the jurisdiction requires it (e.g. the Philippine Data Privacy Act). |

## 4. GoHighLevel

| Check | Status | Notes |
|---|---|---|
| Implementation | Ready (code) | OAuth and private-token connection; durable sync engine; contacts, opportunities, appointments, products and inventory, POS sales as CRM activity, online-order import; reconciliation; monitoring. |
| Automated tests (simulated API) | Ready | 42 GHL tests (21 engine and connection, 21 sync), plus E2E Workflow A over HTTP. |
| Marketplace app, credentials | **Blocked** | Needs a GHL developer account, a marketplace app, and client id and secret (GHL_SETUP_GUIDE.md §1–2). |
| Live verification | **Blocked** | The 15-step checklist in GHL_SETUP_GUIDE.md §5 hasn't been run. **Do not enable sync for a live business until it passes on a test sub-account.** |
| API version | Action (planned) | Uses the supported date versions (2021-07-28 / 2021-04-15). Plan a tested v3 migration; the date-versioned docs are no longer actively maintained. |
| Sync worker schedule | Action | Configure the cron for `/api/integrations/ghl/process` (every 1–5 min) and `?reconcile=1` (hourly). |

## 5. Website move

| Check | Status | Notes |
|---|---|---|
| Original preserved | Ready | `customer-website-reference/` holds the source (byte-identical to the removed routes), standalone pages, screenshots and the migration guide. Git history also has it (commit `c201c07`). |
| GHL website built | Blocked | The business or agency rebuilds the pages in the GHL builder using the migration guide. |
| Old URLs | Action | Set `PUBLIC_WEBSITE_URL` at build time so old links redirect to the GHL site, and update DNS so the main domain points to GHL. |

## 6. Operations

| Check | Status | Notes |
|---|---|---|
| Health check | Ready | `/api/health` (public: database; with the cron bearer: migrations and backlog). |
| Structured logs | Ready | JSON lines with redaction. Ship them to the host's log service. |
| Error monitoring and alerting | Action | No Sentry or equivalent is configured. Alert on `/api/health` 503s and on `sync.failed` / `needsReview` > 0. |
| File storage | Action | Expense receipts use local disk (`UPLOAD_DIR`). They need a persistent volume, or an object-storage adapter on serverless hosts. |
| Email | Action | No provider is integrated. Password resets go through owners setting temporary passwords. |
| Load test | Action | Not done. In particular, test GHL sync with large catalogues against GHL's 100 requests per 10 s limit. |

## 7. Compliance and content

| Check | Status | Notes |
|---|---|---|
| Receipts | Action | Operational receipts, not BIR-accredited official receipts or invoices. |
| Privacy notice and terms | Action | Now part of the GHL website. Have them reviewed for the jurisdiction. |
| Payments copy | Ready | The POS states that payments are recorded, not processed. GHL notes say POS payments weren't processed by GHL. |

## Go-live conditions (all required)

1. GHL live checklist passed on a test sub-account (GHL_SETUP_GUIDE.md §5), with results recorded in SYNC_TEST_PLAN.md.
2. Production database with PITR; migrations rehearsed on a copy.
3. `DEMO_MODE=false`, real `APP_SECRET`, `CRON_SECRET` and GHL app credentials set in the host's secret store; the cron scheduled.
4. Persistent receipt storage decided.
5. Error alerting on health and on sync failures.
6. Explicit approval from the business before any real customer data is imported, and before sync is switched on for a live sub-account.
