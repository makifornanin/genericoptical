# Optical deployment audit — 2026-10-20

Times are Asia/Manila. No application was rebuilt from scratch.

## Codebases and targets

One optical management dashboard was found in the inspected workspace and related user directories. No duplicate optical dashboard was found.

| Role | Folder | Branch / HEAD | Vercel project |
| --- | --- | --- | --- |
| Original dashboard | `C:\Users\Mark\Documents\generic eye` | `phase-6` / `7502c52` | `optical-management-dashboard` (`prj_nnBeqh06uC35Xx3Yr049ORCOcJPi`) |
| Redesigned customer website | `C:\Users\Mark\Documents\optical-customer-website` | `phase-6` / `1c7b62d` | `optical-customer-website` (`prj_cmvc0uwyOChiitiDdhkZgdadThN2`) |
| Legacy GHL customer HTML | `C:\Users\Mark\Documents\optical-ghl-website` | `main` / `48ce773` | No local Vercel link |

Both Vercel projects belong to `maki-s-projects2`, team `team_WYL7KbU8sPudcteS4WLO1p1v`. Each active repository has one worktree. The dashboard's other branches are main, phase-2, phase-4 and phase-5; the customer site's are main and phase-4. These are branches, not duplicate applications.

The dashboard's `customer-website-reference` directory is archived customer-site reference material. Downloaded optical sections and glasses assets are not dashboard applications. Other unrelated dashboard projects exist on this machine and were left alone.

Both active repositories contain substantial pre-existing, uncommitted Phase 6 changes. The customer repository includes staged removals of the old design and untracked replacement source, tests and media. The legacy GHL repository has untracked copied distribution artifacts. No commits, resets, branch changes or application-source edits were made during this audit.

## Claude's completed work

The handoff in `PHASE6_STATUS.md` describes the redesigned catalogue, product and lens flow, bag, pickup checkout, demo payments, order tracking and cancellation, GHL embeds, and corresponding dashboard API, migration and order displays. These implementations exist locally.

The handoff's deployment status was stale: before this audit deployed anything, Vercel already had dashboard Phase 6 production deployment `dpl_Fxsn9fhG3idncgJGgwpqbpBy8DVZ`, created at 14:43:12. Its build logs show 14 migrations applied and no demo snapshot loaded. A comparison of all 453 deployed source files against local files found only the generated `next-env.d.ts` differed. No dashboard redeployment was needed.

The customer site's previous production deployment was from October 16, and was not the redesigned site.

## Deployment performed

- Created a dedicated production website API key with Phase 6 ordering scopes through the live dashboard.
- Updated only the customer project's production `DASHBOARD_SITE_KEY`, marked sensitive. No secret was printed.
- An initial newly created key was revoked unused after an audit-script error; the replacement key is named `Customer website Phase 6 live`. The pre-existing key was not revoked.
- Deployed the existing customer repository to its existing Vercel project.
- Customer deployment: `dpl_4WLXyAsg8y1RERoD7wMyMprk6y7s`, READY, production.
- Deployment URL: https://optical-customer-website-otzwm74bb-maki-s-projects2.vercel.app
- Live customer URL: https://optical-customer-website.vercel.app
- Live dashboard URL: https://optical-management-dashboard.vercel.app

No new Vercel project was created. No Neon reset, seed or direct production database modification was performed by this audit. No existing records were deleted. No GHL pipelines, credentials or unrelated environment variables were changed.

## Fresh validation

Dashboard:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Initial `npm test`: 216 tests passed, but four component workers failed to start with timeouts; this was not treated as a clean pass.
- `npm test -- --maxWorkers=1`: 24 files, 242 tests passed, no reported errors.
- Actual production browser login passed using the existing demo account.
- Dashboard, POS, inventory, customers, orders, sales, analytics and website settings loaded with HTTP 200 and rendered business data.

Customer website:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: fixture production build and all 162 Playwright tests passed. These cover helpers, pages at four widths, accessibility, catalogue, checkout, API validation, SEO, secrets and outage behavior. GHL is stubbed in this suite.
- Vercel production build against the real dashboard passed.
- Actual live homepage, glasses catalogue, product details and bag loaded successfully.
- Live `/api/health` returned `{"status":"ok","api":"ok"}`.
- Live add-to-bag and demo checkout passed.
- Live mobile homepage: no horizontal overflow and no broken loaded images.
- No uncaught page errors during the live checkout run.

## Safe live integration record

Created synthetic order `ORD-000382`, customer `CUS-00637`, explicitly labelled deployment verification only and do not fulfil/contact.

- One Hard Shell Case, Makati pickup, PHP 350.
- Website showed confirmed order and demo payment.
- Dashboard showed website channel, PHP 350 paid, zero balance, `Online card (demo — not charged)`, and one reserved unit.
- GHL contact and opportunity were created through the existing integration.
- After verification, voided only this simulated payment and cancelled only this test order.
- Dashboard audit history confirmed one reserved unit released. Payment and order records remain as voided/cancelled history; no money moved.
- Final GHL display: opportunity `Optical — Sales & Orders · New Order`, status `lost`, last sync `Synced`.

## Limits and remaining work

- Real GHL inquiry submission, actual booking completion, chat conversation and inbound GHL-to-dashboard lead handling were not tested during this audit.
- Payments remain intentionally simulated; no payment provider is connected.
- Existing handoff documents illustrative stock-photo mismatches for some sunglasses/accessory products and legal text requiring review.
- Phase 6 source changes remain uncommitted in both repositories.
- Website error-log query returned no entries. Dashboard error-level logs inspected contained PostgreSQL SSL-mode compatibility warnings on HTTP 200 requests; connection configuration was not changed.
- Runtime verification was a targeted smoke/integration check, not an exhaustive production test of every dashboard action.
