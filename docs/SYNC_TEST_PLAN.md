# GoHighLevel sync test plan

The scenarios required for the GHL integration, the automated test that covers each one, and its live-verification status.

## How to read this

- **Automated tests run against a simulated GHL API, not the real one.** The simulator is `FakeGhl` in `tests/db/ghl-fake.ts`. It implements the documented endpoints we call, plus token issue, expiry and single-use refresh, failure injection (HTTP status, network errors, `Retry-After`), and online orders with transactions.
  - The tests use a real PostgreSQL database and the real services, engine and webhook code.
  - **A passing automated test proves our side of the boundary behaves as designed for the documented API. It does not prove GHL behaves as documented.**
- **Live status:**
  - **Not run:** no GHL test sub-account or credentials were available. The GHL QA connector reported "not connected".
  - Fill in the *Live result* column while running [GHL_SETUP_GUIDE.md §5](GHL_SETUP_GUIDE.md).
- **Test files:**
  - `E` = `tests/db/ghl-connection-engine.test.ts` (21 tests)
  - `S` = `tests/db/ghl-sync.test.ts` (21 tests)
  - `W` = `tests/e2e/workflows.spec.ts` (Workflow A: real HTTP request to the workflow webhook on a running app)

**Run:**
- `npx vitest run tests/db/ghl-connection-engine.test.ts tests/db/ghl-sync.test.ts`
- E2E: `npm run test:e2e`, with the demo database seeded.

## Scenario matrix

| # | Scenario | Automated test (file › test) | Automated result | Live checklist row | Live result |
|---|---|---|---|---|---|
| 1 | Contact created from a dashboard lead, stage tag moves with stage | S › pushes a dashboard lead as a contact with a stage tag, and moves the tag when the stage changes | Pass | §5 #4 | Not run |
| 2 | Duplicate prevention: link to an existing GHL contact by email | S › links to an existing GHL contact found by email instead of creating a duplicate | Pass | §5 #4 | Not run |
| 3 | Duplicate conflict: one GHL contact matches two customers | S › holds the sync for review when one GHL contact matches two different dashboard customers | Pass | – | Not run |
| 4 | GHL form contact → GHL-owned lead; customer never overwritten; out-of-order update ignored | S › creates a GHL-owned lead from a GHL form contact, ignores out-of-order updates, and never overwrites a customer | Pass | §5 #3 | Not run |
| 5 | GHL contact deleted | S › keeps the dashboard lead when the GHL contact is deleted | Pass | – | Not run |
| 6 | Workflow webhook over HTTP → lead → CRM → appointment → conversion | W › Workflow A | Pass (see PHASE2_STATUS.md for the run) | §5 #3 | Not run |
| 7 | Opportunities mirrored; pipeline value ≠ revenue | S › mirrors GHL opportunities and keeps pipeline value separate from revenue | Pass | – | Not run |
| 8 | Opportunity edit conflict (GHL newer) | S › refuses a dashboard change when GHL has a newer version, then applies it once refreshed | Pass | – | Not run |
| 9 | POS sale → one won opportunity + note; payment stays local | S › turns a POS sale into one won opportunity with a contact note; the payment stays a dashboard record | Pass | §5 #5 | Not run |
| 10 | Manual GHL stage move respected | S › respects a stage moved by hand in GHL unless the sale's own stage changes | Pass | – | Not run |
| 11 | Missing pipeline → review; walk-in skipped | S › asks for a pipeline before syncing sales and skips walk-ins without a customer | Pass | – | Not run |
| 12 | Appointments: GHL booking mirrored, reschedule in order, delete → cancel | S › mirrors GHL bookings, applies reschedules in order, and turns deletes into cancellations | Pass | §5 #10 | Not run |
| 13 | Appointments: unmapped calendar → review | S › holds bookings from unmapped calendars for review | Pass | – | Not run |
| 14 | Appointments: dashboard booking pending until GHL confirms | S › pushes a dashboard booking to GHL and marks it synced only after GHL confirms | Pass | §5 #11 | Not run |
| 15 | Products: product + price published; absolute quantity after POS sale | S › publishes product + price, then sends the new absolute quantity after a POS sale | Pass | §5 #7 | Not run |
| 16 | Inventory: GHL down → local stock kept, retried, no stale value | S › keeps the local stock change when GHL is down, retries, and never pushes a stale value | Pass | – | Not run |
| 17 | Inventory reconciliation: drift reported, fixed only on request | S › reconciliation reports a GHL quantity that drifted and only fixes it on request — local stock untouched | Pass | §5 #8 | Not run |
| 18 | Online order import: unpaid ignored, paid imported once, stock deducted once despite duplicate/payment events | S › ignores unpaid orders, imports a paid one once, and deducts stock once despite duplicate/payment events | Pass | §5 #9 | Not run |
| 19 | Online refund → revenue refund + restock review | S › records a GHL refund as a revenue refund and flags restocking for a person | Pass | §5 #9 | Not run |
| 20 | Online order with unlinked items → review; oversold lines not deducted | S › holds orders with unlinked items and records oversold lines without negative stock | Pass | – | Not run |
| 21 | Duplicate webhook deliveries | E › routes by location, ignores unknown locations, deduplicates deliveries and handles uninstall | Pass | §5 #15 | Not run |
| 22 | Signature verification and tampering | E › verifies HighLevel's Ed25519 signature over the raw body and rejects tampering | Pass (test key pair; GHL's real key not exercised) | §5 #15 | Not run |
| 23 | Workflow webhook secret; inactive after disconnect | E › workflow webhook: requires the shared secret and stops working after disconnect | Pass | – | Not run |
| 24 | Transient failure → backoff → synced only after confirmation | E › retries transient failures with back-off and only marks synced after GHL confirms | Pass | – | Not run |
| 25 | Network error | E › same test (injected network failure) | Pass | – | Not run |
| 26 | Rate limit (429 + Retry-After) | E › pauses the business on 429 and defers the rest of the batch without counting attempts | Pass | – | Not run |
| 27 | Missing permission → review; dead letter after max attempts | E › sends missing-scope failures to review and gives up (dead letter) after the maximum attempts | Pass | §5 #12 | Not run |
| 28 | Token expiry: one refresh under concurrency | E › refreshes an expired OAuth token once, even when several calls need it at the same time | Pass | §5 #2 | Not run |
| 29 | Revoked refresh token → reconnect required, work kept | E › marks the connection 'reconnect required' when the refresh token is revoked, and queues changes safely | Pass | – | Not run |
| 30 | OAuth: state binding, single-use code, location verification | E › OAuth: binds state to the member, exchanges the code once, verifies the location | Pass | §5 #1 | Not run |
| 31 | OAuth: agency token refused | E › OAuth: refuses an agency-level authorisation (one business = one sub-account) | Pass | – | Not run |
| 32 | Private token rejected by GHL → nothing saved | E › rejects a token GHL refuses, saving nothing | Pass | – | Not run |
| 33 | One sub-account per business, one business per sub-account | E › allows one sub-account per business and one business per sub-account | Pass | §5 #14 | Not run |
| 34 | Outbox atomicity (rolled-back change sends nothing) | E › writes outbound events in the business transaction — a rolled-back change sends nothing | Pass | – | Not run |
| 35 | Coalescing (latest state sent once) | E › coalesces repeated changes to one record into one pending event | Pass | – | Not run |
| 36 | Crash recovery (abandoned lease) | E › recovers events abandoned by a crashed worker | Pass | – | Not run |
| 37 | Stalled backlog warning | E › flags a stalled backlog (worker not running) and work left mid-send, for the monitoring screen | Pass | – | Not run |
| 38 | Multi-business isolation in the worker | E › isolates businesses in the scheduled worker | Pass | §5 #14 | Not run |
| 39 | Multi-business isolation of webhooks | S › routes each sub-account's events only to its own business | Pass | §5 #14 | Not run |
| 40 | Disconnect / forget keeps dashboard records | E › disconnect deletes credentials, stops queued work; 'forget' clears mirrors but never dashboard records | Pass | §5 #13 | Not run |
| 41 | Permission to manage the integration | E › requires integrations.manage | Pass | – | Not run |
| 42 | Duplicate customers detected (reconciliation) | S › reports customers sharing an email or phone so contact sync stays one-to-one, and closes the finding once fixed | Pass | – | Not run |
| 43 | Oversized webhook body refused before parsing | E › refuses oversized webhook bodies before parsing or queueing anything | Pass | – | Not run |

## Known gaps

- **Everything in the "Live result" column.** In particular, these documented-but-unverified behaviours (see the capability matrix) are only observable live:
  - `state` echo;
  - 429 / `Retry-After` format;
  - whether the legacy RSA header is still sent;
  - order `status` strings;
  - whether stock changes emit `PriceUpdate`;
  - scope requirements for some webhook events.
- **No load test.** The engine claims up to 25 events per business per pass. Behaviour at GHL's 100 requests per 10 s ceiling, with large catalogues (thousands of prices), hasn't been measured.
