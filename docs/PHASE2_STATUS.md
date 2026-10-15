# Phase 2 status (2026-10-16)

Phase 2 covered four things:
- backend hardening;
- the GoHighLevel integration;
- moving the public website out of the app;
- a full bug audit.

**Branch:** `phase-2`. **Checkpoint before Phase 2:** commit `c201c07` on `main`.

## Summary

- **Dashboard UI:** preserved. The only visual changes fix demonstrated defects, or add the GoHighLevel monitoring screen using the existing components (see *UI changes*).
- **Bug audit:** 44 findings, including 1 critical and 3 high. 43 are fixed and 1 is documented as intentional; 40 fixes are verified by tests or scripted checks. See [BUG_AUDIT.md](BUG_AUDIT.md).
- **GoHighLevel:** implemented and tested end to end against a simulated GHL API: OAuth per business, a durable sync engine, contacts, opportunities, appointments, products and inventory, POS sales as CRM activity, online-order import, reconciliation and monitoring. **Nothing has been verified against a real GoHighLevel account.** No credentials were available, and the GHL QA connector reported "not connected".
- **Public website:** archived in `customer-website-reference/` and removed from the app. `/` now opens the dashboard.
- **Production readiness:** **not production-ready.** See [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md).

## Verification (all run 2026-10-16, Windows 11, Node 24, PostgreSQL 18)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | Pass, 0 problems |
| Types | `npm run typecheck` | Pass |
| Unit tests | `npx vitest run --project unit` | 22 / 22 pass |
| Database tests (real PostgreSQL, incl. GHL against the simulator) | `npx vitest run --project db` | 130 / 130 pass |
| Component tests | `npx vitest run --project components` | 16 / 16 pass |
| Production build | `npm run build` | Pass |
| End-to-end, dev server | `npm run test:e2e` | 18 / 18 pass |
| End-to-end, production build | `E2E_BASE_URL=http://localhost:3100 npm run test:e2e` | 18 / 18 pass |
| Health (detailed) | `GET /api/health` with the cron bearer, production build | `migrations` 9/9 applied, sync backlog 0 |
| Demo reseed + integrity | `npm run db:reset-demo` | Pass |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

**Test count changes since Phase 1** (101 Vitest and 19 Playwright tests):
- **Added:**
  - 42 GHL tests;
  - 28 regression tests in `tests/db/phase2-regressions.test.ts`;
  - 10 helper tests;
  - 2 component tests (POS key, lead follow-up);
  - 1 appointment lead-visibility database test;
  - a site-retirement E2E spec.
- **Removed, with the public site:**
  - the Phase 1 GHL tests;
  - the public-site E2E spec;
  - the booking-form component test.
- **Changed:** E2E Workflow A now starts from a real HTTP request to the GHL workflow webhook, instead of the removed contact form.

## Feature classification

| Status | Meaning |
|---|---|
| **Implemented** | The code exists in this branch. |
| **Automated** | Verified by automated tests. For GHL, that means against the simulator, not GHL itself. |
| **Live** | Verified against a real GoHighLevel sub-account. |
| **Blocked** | Live verification is waiting on credentials. |
| **Unsupported** | The GHL API doesn't offer it, so it isn't built. |

| Feature | Implemented | Automated | Live | Blocked | Unsupported |
|---|---|---|---|---|---|
| Per-business GHL connection via OAuth (state, refresh, location verification) | ✓ | ✓ | – | ✓ | |
| Connection via private integration token | ✓ | ✓ | – | ✓ | |
| Disconnect / forget / reconnect / uninstall webhook | ✓ | ✓ | – | ✓ | |
| Encrypted token storage, never sent to the browser | ✓ | ✓ | n/a | | |
| Durable outbox and inbox, retries, backoff, rate-limit pause, dead letter, crash recovery | ✓ | ✓ | – | ✓ | |
| Webhook signature verification (Ed25519 + legacy RSA), deduplication, size cap | ✓ | ✓ (test key) | – | ✓ | |
| Workflow webhook (GHL form → dashboard lead) | ✓ | ✓ (incl. E2E over HTTP) | – | ✓ | |
| Contacts ↔ leads and customers, with ownership rules and duplicate handling | ✓ | ✓ | – | ✓ | |
| Lead stage tags; order-ready trigger tag | ✓ | ✓ | – | ✓ | |
| GHL opportunities mirrored; pipeline view | ✓ | ✓ | – | ✓ | |
| POS sale / order → GHL opportunity + contact note | ✓ | ✓ | – | ✓ | |
| POS sale → GHL order or transaction | | | | | ✓ (no order-create API) |
| Offline POS payment recorded in GHL Payments | | | | | ✓ (deliberately not done; `record-payment` applies only to GHL orders) |
| Appointments: GHL → dashboard (mapped calendars) | ✓ | ✓ | – | ✓ | |
| Appointments: dashboard → GHL when GHL is authoritative (pending → synced) | ✓ | ✓ | – | ✓ | |
| Products and prices published to GHL | ✓ | ✓ | – | ✓ | |
| Inventory pushed as absolute quantity; drift reconciliation | ✓ | ✓ | – | ✓ | |
| Inventory delta or reservation in GHL | | | | | ✓ (absolute set only) |
| GHL online orders imported once (stock once, refunds, duplicates, out-of-order) | ✓ | ✓ | – | ✓ | |
| Duplicate, mismatch and stalled-sync detection | ✓ | ✓ | – | ✓ | |
| Monitoring screen (Settings → Integrations → GoHighLevel) | ✓ | partial (the overview, backlog and mismatch data behind it are tested; all four tabs were rendered as the owner, with no console errors) | – | ✓ | |
| Website archive and standalone pages | ✓ | n/a (verified by byte comparison and screenshots) | n/a | | |
| Public routes removed; `/` → dashboard; robots disallow | ✓ | ✓ (E2E) | n/a | | |

## Website extraction

- **Location:** `customer-website-reference/` (136 files). The archive holds:
  - `pages/<page>/source/`: the original TSX, byte-identical to the removed routes (all 18 files checked). Each page also has `NOTES.md` (behaviour and data sources) and `content.md` (copy);
  - `components/`, `styles/` (`tokens.md`), `assets/` (logo, favicon, product art);
  - `screenshots/`: desktop and mobile for every page;
  - `standalone/`: 10 static HTML pages plus `site.css` and `site.js`;
  - `MANIFEST.md`;
  - `ghl-migration-guide.md`: every section classified (a) native GHL builder, (b) custom code, (c) GHL form, (d) GHL calendar, (e) depended on our backend, (f) not transferable, with the rebuild steps.
- **Removed from the app:**
  - `src/app/(site)/` and `sitemap.ts`;
  - the public-site E2E spec and the booking-form component test.
- **Kept:**
  - `robots.ts`, which now disallows all;
  - the services behind the old forms (still tested);
  - the *Website* settings copy, labelled as source material for the GHL rebuild.
- **Old URLs:** they return 404, or redirect to `PUBLIC_WEBSITE_URL` when it is set at build time.
- **Known issue in the original site, documented and not carried over:** horizontal overflow on the booking page when slots are selected. The standalone copy is fixed.

## UI changes (dashboard)

| Change | Why |
|---|---|
| Dropdowns show their chevron again | Defect M7: the arrow never rendered |
| POS on phones: capped product grid and a sticky "Current sale" bar | Defect M2: the cart was about 13,000 px down the page |
| Lead edit dialog keeps the follow-up time | Defect B7 |
| Dashboard hides product revenue from staff without analytics access | Defect A13 (permission leak) |
| Report subtitle "Net of discounts and item returns" | The breakdowns now subtract returns (A13) |
| *Settings → Integrations → GoHighLevel* rebuilt (overview, per-area status, needs attention, findings, mapping, log, endpoints, stalled-sync warning) | Phase 2 monitoring requirement. It uses the existing Card, Pill, Table, Button and Segmented components. |
| Product "Show in online store" label; Settings → Website subtitle | Defect M5 (copy referred to the removed site) |

## Backend reliability (spec part 3), where it lives

| Requirement | Implementation |
|---|---|
| Foreign keys, unique constraints, indexes | Composite tenant foreign keys; unique idempotency keys and `external_ghl_order_id`; partial unique index for one GHL location per business; indexes for the sync queue. |
| Transactions and concurrency | Row locks in a deterministic order; `SKIP LOCKED` sync claims; retry on 40001 and 40P01; advisory locks for sign-in and demo reset. |
| Precise money | Integer minor units everywhere; a safe-integer ceiling on totals (A17). |
| No negative stock, no double deduction or receiving | `CHECK` constraints; idempotent movements (M1, A8); receipts idempotent with a request fingerprint (A2, A6); online orders deduct once. |
| POS safety | Server-priced totals; idempotent checkout bound to the request fingerprint; sale + payment + stock in one transaction; partial payments; refunds with tax allocation (A5, A7); concurrent void safe (A1). |
| Resilience | Structured JSON logs with redaction; typed integration errors; durable queue with retries and dead letter; audit trail; `/api/health` with migration and backlog checks. |
| No AI agents | None added. All matching and reconciliation is rule-based. |

## Not done / next steps

1. **Live GHL verification** on a test sub-account (GHL_SETUP_GUIDE.md §5). This needs the marketplace app and credentials.
2. Build the website in GoHighLevel using the migration guide, then set `PUBLIC_WEBSITE_URL` and DNS.
3. The remaining go-live conditions in DEPLOYMENT_READINESS.md: PITR backups, error alerting, receipt storage, email provider, and compliance review.
4. A planned move to the GHL v3 API surface, once the live tests on the date versions pass.
5. A load test of sync with a large catalogue, against GHL's rate limits.
