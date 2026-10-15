import { config } from "dotenv";
import pg from "pg";
import { encrypt, randomToken } from "../../src/server/auth/tokens";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Test-only setup for the inbound GoHighLevel path: gives the demo business a GHL connection with a
 * known workflow-webhook secret and every outbound sync area switched off, so E2E can send the same
 * request a GHL workflow would — without any call to the real GHL API. `restore()` puts the previous
 * connection row back exactly as it was.
 */
export async function withE2eGhlConnection() {
  const { DATABASE_URL, APP_SECRET } = process.env;
  if (!DATABASE_URL || !APP_SECRET) throw new Error("E2E needs DATABASE_URL and APP_SECRET (from .env.local) to set up the GHL connection.");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const biz = await client.query<{ id: string; slug: string }>("select id, slug from businesses where is_demo order by created_at limit 1");
  if (!biz.rowCount) throw new Error("No demo business — run npm run db:reset-demo first.");
  const { id: businessId, slug } = biz.rows[0];
  const before = await client.query("select * from integration_connections where business_id = $1 and provider = 'gohighlevel'", [businessId]);
  const secret = randomToken(24);
  const settings = { sync: { contacts: false, opportunities: false, appointments: false, products: false, inventory: false, sales: false, orders: false } };
  await client.query(
    `insert into integration_connections (business_id, provider, status, auth_type, external_account_id, account_name, webhook_secret_encrypted, settings)
     values ($1, 'gohighlevel', 'connected', 'private_token', $2, 'E2E test location', $3, $4)
     on conflict (business_id, provider) do update set status = excluded.status, auth_type = excluded.auth_type, external_account_id = excluded.external_account_id,
       account_name = excluded.account_name, webhook_secret_encrypted = excluded.webhook_secret_encrypted, settings = excluded.settings`,
    [businessId, `e2e-${randomToken(6)}`, encrypt(secret, APP_SECRET), JSON.stringify(settings)],
  );
  return {
    businessId,
    slug,
    secret,
    async restore() {
      const row = before.rows[0];
      if (row) {
        await client.query(
          `update integration_connections set status = $2, auth_type = $3, external_account_id = $4, account_name = $5, webhook_secret_encrypted = $6, settings = $7 where id = $1`,
          [row.id, row.status, row.auth_type, row.external_account_id, row.account_name, row.webhook_secret_encrypted, JSON.stringify(row.settings ?? {})],
        );
      } else {
        await client.query("delete from integration_connections where business_id = $1 and provider = 'gohighlevel'", [businessId]);
      }
      await client.end();
    },
  };
}
