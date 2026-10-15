# GoHighLevel setup guide

Step-by-step setup for connecting businesses to GoHighLevel (GHL), and how to verify the integration against a real **test** sub-account before trusting it with live data.

**Who does what:**
- The **operator** (whoever deploys the dashboard) does sections 1–2 once.
- Each **business owner** does section 3 for their own sub-account.
- Section 5 is the live verification that hasn't been done yet.

> The code and simulated-API tests are complete. **No step below has been carried out against a real GHL account yet.** Treat the first run as a test, on a sandbox or test sub-account.

## 1. Create the marketplace app (operator, once)

1. Sign in at https://marketplace.gohighlevel.com with a developer account. Choose **My Apps → Create App**.
2. **Basic info:**
   - Distribution: *Sub-account*. Target user: *Sub-account*. One business = one sub-account, and agency-level installs are refused by the dashboard.
   - Listing: private or unlisted, until verified.
3. **Advanced Settings → Auth → Scopes.** Add exactly these (they match `src/server/integrations/ghl/constants.ts`):

   | Scope | Why |
   |---|---|
   | `contacts.readonly`, `contacts.write` | Find and create contacts, tags, notes; contact webhooks |
   | `opportunities.readonly`, `opportunities.write` | Pipelines, sale opportunities; opportunity webhooks |
   | `calendars.readonly` | List calendars for mapping |
   | `calendars/events.readonly`, `calendars/events.write` | Read and push appointments |
   | `users.readonly` | Map GHL users to staff |
   | `locations.readonly` | Verify the sub-account and read its time zone |
   | `locations/customFields.readonly` | Reserved for field mapping |
   | `products.readonly`, `products.write` | Publish products |
   | `products/prices.readonly`, `products/prices.write` | Publish prices and set inventory |
   | `payments/orders.readonly`, `payments/transactions.readonly` | Import online-store orders and their payments |

   Scopes can only be changed while the app version is a **draft**. Add them all before publishing.
4. **Advanced Settings → Auth → Redirect URL:** `https://<your-dashboard-domain>/api/integrations/ghl/oauth/callback`. It must match `GHL_REDIRECT_URI`, which defaults to `<APP_URL>/api/integrations/ghl/oauth/callback`.
5. **Advanced Settings → Auth → Client keys:** generate a client ID and secret. Store the secret in your secrets manager only.
6. **Advanced Settings → Webhooks:**
   - URL: `https://<your-dashboard-domain>/api/integrations/ghl/webhooks`.
   - Turn on these events:
     - Contacts: ContactCreate, ContactUpdate, ContactTagUpdate, ContactDndUpdate, ContactDelete
     - Opportunities: OpportunityCreate, OpportunityUpdate, OpportunityStageUpdate, OpportunityStatusUpdate, OpportunityMonetaryValueUpdate, OpportunityAssignedToUpdate, OpportunityDelete
     - Appointments: AppointmentCreate, AppointmentUpdate, AppointmentDelete
     - Orders: OrderCreate, OrderStatusUpdate
     - App lifecycle: INSTALL (on by default), UNINSTALL
   - Other events are acknowledged and ignored.

## 2. Configure the deployment (operator, once)

Set these as environment variables (placeholders are in `.env.example`; never commit real values):

| Variable | Value |
|---|---|
| `GHL_CLIENT_ID` | From step 1.5 |
| `GHL_CLIENT_SECRET` | From step 1.5 (server only; never exposed to the browser) |
| `GHL_REDIRECT_URI` | Only if it differs from `<APP_URL>/api/integrations/ghl/oauth/callback` |
| `GHL_MARKETPLACE_URL` | Only for white-label agencies: `https://marketplace.leadconnectorhq.com` |
| `APP_URL` | The public dashboard URL (used for webhook and redirect URLs) |
| `APP_SECRET` | 32+ random characters. Encrypts stored tokens. **Changing it makes stored tokens unreadable, so every business must reconnect.** |
| `CRON_SECRET` | Long random string for the sync worker |

**Schedule the sync worker:**
- `POST https://<domain>/api/integrations/ghl/process` with header `Authorization: Bearer <CRON_SECRET>`, every 1–5 minutes.
- Also `.../process?reconcile=1` hourly.
- On Vercel, use Cron Jobs. Elsewhere, any scheduler (GitHub Actions, cron + curl, a cloud scheduler) works.
- Without the worker, changes still sync right after staff actions and on webhooks, but retries and reconciliation won't run. The monitoring screen will show a *waiting to sync* warning.

## 3. Connect a business (each owner)

1. Sign in as an **owner**, or a member with *Manage integrations*.
2. Open **Settings → Integrations → GoHighLevel → Overview**.
3. Click **Connect GoHighLevel** and choose the business's sub-account in GHL's chooser. You return to Settings with the result.
   - An agency-level authorisation is refused, so pick a sub-account.
   - A sub-account already connected to another business is refused.
4. The connection card should show *Connected*, the sub-account name and id, and the token expiry. The token itself is never shown.

**Alternative (no marketplace app):** click **Connect with a token**, then enter the sub-account (location) ID and a Private Integration token. Create the token in GHL under Settings → Private Integrations, with the scopes from step 1.3. The token is verified against the sub-account before it's saved.

## 4. Map and switch on sync areas (each owner)

Go to **Settings → Integrations → GoHighLevel → Sync settings & mapping**:

1. **Refresh GHL data** loads pipelines, calendars and users.
2. **Sales pipeline** and its stages (*Stage: POS sale completed*, *order placed*, *order ready for pickup*, *order handed over*). This is required before sales sync. Until it's set, sale events wait in *Needs attention*.
3. **Calendars:** map each GHL calendar to a branch and appointment type. Bookings from unmapped calendars are held for review.
4. **Users:** check the automatic email matches between GHL users and staff.
5. **Appointments system of record:** *Dashboard* (default) or *GoHighLevel calendars*.
6. **Stockroom published to GHL:** the location whose available quantity GHL shows.
7. **Branch for online orders:** whose stockroom online-store orders deduct from.
8. **Sync switches:** contacts, opportunities, appointments, sales (on by default); products, inventory, online orders (off until mapped).
9. **Save sync settings.**
10. If products and inventory are on: **Publish all products**, then **Push all stock**.
11. **Optional:** **Sync all customers** pushes existing customers as contacts.
    - Run *Run reconciliation* first.
    - Fix any *duplicate customer* findings so contacts stay one-to-one.

**Optional workflow webhook** (to send GHL form submissions without the marketplace app): in a GHL workflow, add a **Webhook** action that POSTs to the URL shown under **Endpoints → Workflow webhook**, with header `x-webhook-secret: <value shown there>`. Send `contact_id`, `full_name` (or `first_name` / `last_name`), `email`, `phone`, and optionally `customData.message`.

## 5. Live verification checklist (not yet done)

Run this on a **test sub-account** with test data, in a staging deployment. Record each result in [SYNC_TEST_PLAN.md](SYNC_TEST_PLAN.md) (*Live result* column).

| # | Action | Expected result |
|---|---|---|
| 1 | Connect via OAuth | *Connected*. Sub-account name shown. `integration_connections.scopes` lists every scope from step 1.3. Confirm whether GHL echoed `state`: the server logs `ghl.oauth_state_missing` if it didn't. |
| 2 | Wait 24 h, or set `token_expires_at` in the past on staging, then *Sync now* | The token refreshes once and sync continues. |
| 3 | Submit a GHL form for a new person | A lead appears in **Leads** (source *GoHighLevel*) within seconds. The webhook appears in Sync log as *Synced*. |
| 4 | Create a lead in the dashboard and move its stage | The contact exists in GHL (no duplicate if the email already existed) with tag `<prefix>-stage-<stage>`. |
| 5 | POS sale for a linked customer | Opportunity in the sales pipeline: *won*, value = sale total, contact note says the payment was recorded at the shop. **No GHL order or transaction is created.** |
| 6 | Refund part of that sale | Opportunity value drops to total − refund. |
| 7 | Publish products, then sell one unit at the POS | GHL price `availableQuantity` decreases by one (absolute value matches the dashboard). |
| 8 | Change a GHL quantity by hand, then *Run reconciliation* | An *inventory mismatch* finding appears; dashboard stock is unchanged. *Push dashboard stock* fixes GHL. |
| 9 | Buy a product in the GHL online store (test mode off, small amount), then refund it | One sale (channel *GoHighLevel online*) is imported once, stock is deducted once, the refund is recorded, and a restock review item opens. Confirm which webhooks arrived, and whether a `PriceUpdate` fired. |
| 10 | Book in a mapped GHL calendar; reschedule; delete | Dashboard appointment created → moved → cancelled. |
| 11 | With *GoHighLevel calendars* authoritative, book in the dashboard | Shows *pending*, then *synced* once GHL confirms. The event exists in GHL. |
| 12 | Temporarily remove a scope from the token or private integration | Affected events go to *Needs attention* with a permissions message; nothing else breaks. |
| 13 | Uninstall the app from the sub-account | Connection *Disabled*; queued work stops; dashboard data intact. |
| 14 | Second business with a second test sub-account | Each business sees only its own contacts, events and findings. |
| 15 | Check the webhook signature header on real deliveries | `X-GHL-Signature` verifies. Note whether `X-WH-Signature` is still sent. |

**If any row fails:** capture the Sync log entry (error and HTTP status), the request id from the server log (`ghl.*` JSON lines; tokens are redacted), and the GHL webhook log entry.

## 6. Operating it

- **Monitoring:** *Settings → Integrations → GoHighLevel* shows status, last sync, per-area queues, *Needs attention*, reconciliation findings, and a warning when work has waited more than 30 minutes. `GET /api/health` with the cron bearer returns backlog counts for uptime tools.
- **Reconnect required:** the refresh token was revoked, or the app was reinstalled. Click **Reconnect**. Queued changes are kept and resume.
- **Rate limited:** the business pauses automatically until GHL's window resets. Other businesses aren't affected.
- **Disconnect:** removes stored credentials and stops sync. *When disconnecting, also forget sync data* also clears GHL links and mirrors. Dashboard customers, sales and stock are never deleted.
