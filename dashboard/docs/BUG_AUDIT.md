# Phase 2 bug audit

Every defect found in the Phase 2 audit, how it was fixed, and how the fix was verified.

## Scope and method

- **Method:**
  - Two independent code audits of every module: operations (sales, inventory, purchasing, reports, catalogue) and security (auth, staff, tenancy, public inputs, files, webhooks).
  - A review of the Phase 1 GoHighLevel code.
  - Issues found while testing (IDs starting with M).
- **Baseline:** commit `c201c07` (Phase 1 checkpoint). Lint, typecheck, 101 Vitest and 19 Playwright tests passed at that point.
- **Severity:**
  - **Critical:** data of another business exposed or taken over.
  - **High:** money, stock or availability wrong for normal use.
  - **Medium:** wrong result in a realistic situation, or a security weakness that needs an attacker.
  - **Low:** edge case, hardening, or misleading copy.
- **Verification column:**
  - **Automated:** a named test that fails without the fix and passes with it.
  - **Scripted check:** a script run against the running app, with results recorded here.
  - **Code review:** reasoning only, with no test. Listed honestly where a deterministic test wasn't practical.
- **All automated results are from the final run on 2026-10-16** (see [PHASE2_STATUS.md](PHASE2_STATUS.md)). Test files:
  - `R` = `tests/db/phase2-regressions.test.ts`
  - `U` = `tests/unit/phase2-helpers.test.ts`
  - `E` = `tests/db/ghl-connection-engine.test.ts`
  - `S` = `tests/db/ghl-sync.test.ts`

## Summary

| Severity | Found | Fixed | Fixed and verified by test or scripted check | Fixed, code review only | Documented (no code change) |
|---|---|---|---|---|---|
| Critical | 1 | 1 | 1 | 0 | 0 |
| High | 3 | 3 | 3 | 0 | 0 |
| Medium | 12 | 12 | 12 | 0 | 0 |
| Low | 28 | 27 | 24 | 3 | 1 |
| **Total** | **44** | **43** | **40** | **3** | **1** |

Two of the 40 verified fixes contain a secondary part that was checked by code review only:
- **A19:** the export row cap.
- **B17:** the demo-reset lock.

## Critical

### B1 · Staff: cross-business account takeover
- **Issue:** An owner of business A could add a staff member using the email of a person in business B. A then controlled that sign-in: renaming it, changing its email, or setting a temporary password, which also signed the person out everywhere.
- **Root cause:** Users are global. `createStaff` reused an existing user by email. `updateStaff` and `setTemporaryPassword` wrote to the global user row without checking other memberships.
- **Fix:** `createStaff` refuses an email that already has an account. Identity and password changes are refused for an account that belongs to another business (only its owner can change it). Owner-only checks are kept.
- **Regression test:** R › B1 › an owner can't attach, rename or reset an account that belongs to another business.
- **Verification:** Automated, pass.

## High

### A1 · Payments: concurrent void counted twice
- **Issue:** Two simultaneous voids of the same payment both succeeded, reducing *paid* twice.
- **Root cause:** The payment was read before the sale row was locked.
- **Fix:** Lock the sale first, then re-read the payment `FOR UPDATE`, and refuse if it's already voided.
- **Regression test:** R › A1.
- **Verification:** Automated, pass.

### B2 · GoHighLevel (Phase 1): one failing business stalled sync; conflicts retried forever
- **Issue:**
  - The scheduled sync loop had no per-business error isolation.
  - A contact-id unique conflict was retried indefinitely.
- **Root cause:** The Phase 1 outbox processed businesses in one loop and treated every error as retryable.
- **Fix:** Replaced by the new engine:
  - per-business isolation;
  - typed errors;
  - *Needs review* for conflicts;
  - dead letter after 8 attempts.
- **Regression tests:**
  - E › isolates businesses in the scheduled worker
  - S › holds the sync for review when one GHL contact matches two different dashboard customers
  - E › sends missing-scope failures to review and gives up (dead letter) after the maximum attempts
- **Verification:** Automated, pass.

### M3 · Build: archived website notes broke the app's CSS (every page returned 500)
- **Issue:** After `customer-website-reference/` was added, the dev server failed to compile `globals.css` with "Module not found: Can't resolve '...'", and every page returned 500. Found when the first E2E run in this phase failed 18 of 18.
- **Root cause:** Tailwind v4 automatically scans every non-ignored file. The archive's Markdown quoted the class `bg-[url(...)]`. Tailwind generated `background-image: url(...)`, which Turbopack tried to resolve as a file.
- **Fix:** `@source not` for `customer-website-reference/`, `docs/` and `test-results/` in `globals.css`.
- **Regression test:** Production build plus the full E2E suite (any page 500 fails them).
- **Verification:** Automated. The build passes, and E2E passes 18/18 on both the dev server and the production build.

## Medium

### A2 · POS / orders / payments: idempotency key not bound to the request
- **Issue:** Reusing a request id with different details (e.g. the cashier changed the cart after a failed attempt) silently returned the earlier result.
- **Root cause:** Only the key was stored and compared.
- **Fix:**
  - A request fingerprint (`request_hash`, migration 0007) is stored for sales, orders, payments, refunds and receipts. A mismatch returns a clear conflict.
  - The POS and order form create a new key when the cart changes after a failure.
- **Regression tests:**
  - R › A2 (two tests)
  - `tests/components/pos-terminal.test.tsx` › A2: uses a new idempotency key when the cart changes after a failed attempt
- **Verification:** Automated, pass.

### A3 · Orders: cost of goods used the cost on the day the order was taken
- **Issue:** COGS for a customer order used the variant cost from order creation, not from handover when the stock actually left.
- **Root cause:** The `unit_cost_cents` snapshot was taken at creation.
- **Fix:** Refresh line cost from the current weighted-average cost at handover, and recompute the sale cost.
- **Regression test:** R › A3.
- **Verification:** Automated, pass.

### A4 · Products: CSV import wiped data
- **Issue:** A blank price imported as 0.00. Columns missing from the file reset reorder points and barcodes.
- **Root cause:** Every known field was written from the row, with defaults for missing cells.
- **Fix:**
  - The import is rewritten: only columns present and non-blank are changed.
  - Price is required for new SKUs.
  - Every row is validated before anything is written.
- **Regression test:** R › A4/A12.
- **Verification:** Automated, pass.

### A5 · Refunds: tax on a typed amount used the whole sale's ratio
- **Issue:** Refunding a typed amount against a returned taxable line refunded tax at the blended ratio of the whole sale. In mixed taxable and exempt sales that is too little or too much.
- **Fix:** Use the returned lines' own tax ratio.
- **Regression test:** R › A5.
- **Verification:** Automated, pass.

### B3 · Staff: privilege escalation by staff admins
- **Issue:** A non-owner with *Manage staff* could change their own role and permissions, and grant permissions they didn't have (including owner-only ones).
- **Fix:** `assertCanAssign` enforces three rules:
  - no changes to one's own access;
  - only permissions the actor holds;
  - owner-only grants (staff, settings, integrations) reserved to owners.
- **Regression test:** R › B3.
- **Verification:** Automated, pass.

### B4 · Sign-in: throttle bypassed by parallel guesses
- **Issue:** Parallel sign-in attempts all read the failure count before any was recorded, so the 8-attempt limit didn't hold.
- **Fix:**
  - Count and record under a per-email advisory lock inside one transaction.
  - Add a per-IP ceiling of 50 failures in 15 minutes.
- **Regression test:** R › B4 (16 parallel guesses → exactly 8 password checks).
- **Verification:** Automated, pass.

### B5 · Sign-in: client IP taken from a spoofable header
- **Issue:** The IP used for throttling was the left-most `X-Forwarded-For` value, which the client controls.
- **Fix:** `clientIp()` trusts only the entries added by the configured number of proxies (`TRUST_PROXY_HOPS`, default 1).
- **Regression test:** U › B5 (two tests).
- **Verification:** Automated, pass.

### B6 · Public forms: phoneless matching and consent switch-on
- **Issue:**
  - A phone like `((((((` (no digits) matched every lead without a phone, attaching the submission to the wrong person.
  - A repeat anonymous submission could switch SMS or marketing consent on for an existing person.
- **Fix:**
  - Phones need at least 7 digits.
  - Repeat submissions never change consent; the request is logged on the lead for staff.
  - (The public forms themselves have since moved to GHL. The service is kept and still tested.)
- **Regression test:** R › B6.
- **Verification:** Automated, pass.

### B7 · Leads: follow-up time shifted on every edit
- **Issue:** The edit dialog showed the stored UTC time as if it were local, so saving without changes moved the follow-up by the zone offset (8 hours in Manila).
- **Fix:** Pass the ISO instant to the dialog and convert it to local time there.
- **Regression test:** `tests/components/lead-form.test.tsx` › B7 (pinned to Asia/Manila).
- **Verification:** Automated, pass.

### B8 · Expenses: receipts over 1 MB failed; orphan files
- **Issue:**
  - Uploads over Server Actions' default 1 MB body limit failed, despite the stated 5 MB limit.
  - A rejected form left the file on disk.
  - A replaced receipt was never deleted.
- **Fix:**
  - `serverActions.bodySizeLimit: "6mb"`.
  - Validate before saving the file; delete it if the save fails; delete the replaced file.
- **Regression test:** None automated (it needs the Server Actions transport).
- **Verification:** Scripted check against the production build (`next start`):
  - A 2.5 MB PDF uploaded and downloaded byte-for-byte (2,621,456 bytes).
  - A rejected submission wrote no file: the upload folder held only the saved receipt.

### B9 · Expenses: attachment with a non-Latin-1 name couldn't be downloaded
- **Issue:** Names with curly quotes, en dashes or CJK characters produced an invalid `Content-Disposition` header, so the download failed.
- **Fix:** `contentDisposition()` sends an ASCII fallback plus the RFC 5987 `filename*` UTF-8 name. CSV exports use it too.
- **Regression test:** U › B9 (two tests).
- **Verification:** Automated, pass. The scripted B8 check also downloaded `Receipt – “Café” 東京.pdf` with the correct header.

### M2 · POS on phones: cart 13,000 px below the catalogue
- **Issue:** On narrow screens the full product grid came first, so the cart and *Complete sale* were far down the page.
- **Fix:**
  - Under the `lg` breakpoint, the product grid gets a capped height (`max-h-[58vh]`).
  - A sticky "Current sale · n items · total · Review" bar jumps to the cart.
  - Desktop layout is unchanged.
- **Regression test:** None automated (layout).
- **Verification:** Scripted check at 390 px with two items:
  - the bar is visible and *Review* reaches the cart;
  - page height 1,684 px;
  - no horizontal overflow.

## Low

| ID | Issue | Root cause → fix | Regression test | Verification |
|---|---|---|---|---|
| A6 | A duplicate payment, refund or receipt that waited on the lock failed a business check instead of returning the original result. | Idempotency lookup ran before the lock → re-check after locking (`Replay`). | R › A6 | Automated, pass |
| A7 | Repeated amount-only refunds could return more tax than was collected, through rounding. | Independent rounding → cumulative allocation, capped by tax already refunded. | R › A7 | Automated, pass |
| A8 | A repeated "set count to 7" was rejected or audited twice. A repeated transfer could apply twice. | Replay detected too late → early return on the movement's idempotency key. | R › A8 | Automated, pass |
| M1 | Replaying a stock removal after the shelf emptied failed with "not enough stock". | Validation before the idempotency check → check first. | R › M1 | Automated, pass |
| A9 | Opening stock on new products accepted negative quantities or another business's location, needed no receiving permission, and saved cost without cost permission. | Unvalidated input → zod schema, `inventory.receive` required, location ownership check, cost hidden without `products.costs`. | R › A9 | Automated, pass |
| A10 | Stock could be received for a product changed to a service, and the type could change while on an open PO. | Missing checks → receive re-checks type; type change blocked while open PO lines exist. | R › A10 | Automated, pass |
| A11 | Product type change and archive checks could race a concurrent sale or PO. | Checks without locks → variant rows locked `FOR UPDATE` first. | – | Code review |
| A12 | CSV edge cases: duplicate SKUs in one file, non-numeric reorder values, a stray quote swallowing the rest of the file, new SKUs joining the wrong product, the formula-guard apostrophe kept on re-import. | Parser and import gaps → RFC 4180 quote handling with an unclosed-quote error, per-row validation, same-product check, apostrophe stripped. | U › A12 (three tests); R › A4/A12 | Automated, pass |
| A13 | Category, product and staff breakdowns ignored returns (didn't add up to net sales). The dashboard showed product revenue to staff without analytics access. | Breakdowns summed sale lines only → subtract revenue refunds dated in the period; revenue hidden without `analytics.view`. | R › A13 (two tests) | Automated, pass |
| A14 | Voiding or cancelling changes the original period's figures (reports aren't frozen). | Design decision, kept: refunds are dated when issued; voids and cancellations correct the original record. Documented in ARCHITECTURE.md. | – | Documented (no code change) |
| A15 | Editing an order's items dropped its discount. | The patch omitted the stored discount → fall back to it. | R › A15 | Automated, pass |
| A16 | A free item (zero-priced line) couldn't be returned to stock. | Refund amount had to be > 0 (code and `CHECK`) → zero allowed only when items are returned (migration 0008). | R › A16 | Automated, pass |
| A17 | Extreme totals could exceed JavaScript's safe-integer range and be stored rounded. | No ceiling → reject totals above 1,000,000,000.00. | R › A17 | Automated, pass |
| A18 | Deposit refunds made before migration 0002 counted as revenue refunds. | No backfill → backfilled in migration 0006. | – (migration) | Migration applied to the test template and dev database; seed integrity checks pass |
| A19 | Impossible custom report dates (e.g. 2026-02-30) rolled over silently. Sales and movement exports were cut off at 20,000 / 50,000 rows without warning. | Format-only date check → real-day check with fallback; exports above 50,000 rows refused with a message (422). | U › A19 (two tests) for dates | Automated, pass (dates); code review (export cap) |
| B10 | Two owners demoting each other at the same time could leave no owner. | Count without lock → owner rows locked; deadlocks retried. | R › B10 | Automated, pass |
| B11 | The workflow webhook still accepted deliveries after disconnect. Any unique violation was treated as a duplicate. The body was read without a size cap. | Phase 1 handler → new handlers check connection status, deduplicate on the idempotency key, and read bodies with a 256 KB cap. | E › workflow webhook…; E › refuses oversized webhook bodies…; U › B11 | Automated, pass |
| B12 | Staff could book (and move the stage of) leads they can't see in the CRM. | No lead-visibility check in booking → same rule as the CRM when a lead is attached; rescheduling an existing booking stays allowed. | `crm-appointments.test.ts` › B12 | Automated, pass |
| B13 | Inactive appointment types could be booked online. | Public lookup ignored `is_active` → checked, with a clear message. | R › B13 | Automated, pass |
| B14 | A password reset didn't lift the sign-in lockout. Older reset links stayed valid. | → All outstanding links retired, and failed attempts cleared, on reset. | R › B14 | Automated, pass |
| B15 | Editing a prescription could move it to another patient. | Update filtered by id only → also by customer. | R › B15 | Automated, pass |
| B16 | Malformed filters in the URL (stage, ids, page numbers) caused 500 errors. | Unvalidated → enums and UUIDs validated, paging clamped. | R › B16 | Automated, pass |
| B17 | In the public demo, an owner could change the shared demo passwords and emails, locking others out. Demo reset had no lock or error handling. | → Demo guards on password and email changes; reset under an advisory lock with errors reported. | R › B17 (passwords, emails) | Automated, pass (guards); code review (reset lock) |
| B18 | Converting a lead failed when a customer already held the lead's GHL contact id. | Unique violation → the new customer starts without the id; the mirror links them. | R › B18 | Automated, pass |
| M4 | After B12, the demo seed skipped some lead bookings ("Unknown lead"). | Seed booked as random staff → booked by the lead's owner. | – | Scripted: `npm run db:reset-demo` shows 0 such skips; integrity checks pass |
| M5 | Copy still described the removed public website ("Show on website — listed on the public eyewear page"; Settings → Website "edits the public site"). | Stale copy → describes the GHL online store and the archived copy. Layout unchanged. | – | Code review |
| M6 | A webhook key override couldn't be given as a one-line environment value. | Raw PEM required → `\n` escapes accepted. | – | Code review |
| M7 | Dropdowns had no arrow (the `Select` chevron never rendered). | A Tailwind arbitrary value containing spaces was split into separate classes → a `select-chevron` utility in `globals.css`. | – | Screenshot check (Products → New product) |

## Not fixed (accepted)

- **A14** (above) is intentional behaviour, documented.
- **Code-review-only items** (A11, M5, M6, plus the A19 export cap and the B17 reset lock) don't have deterministic tests. Each is a small, local change. Exercising A11 meaningfully needs a concurrency harness.
