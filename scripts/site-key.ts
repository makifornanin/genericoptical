import "./load-env";
import { and, asc, eq, isNull, like } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { apiKeys, businesses } from "@/server/db/schema";
import { createSiteKey } from "@/server/services/public-api";

/**
 * Manages customer-website API keys (docs/PUBLIC_API.md).
 *
 *   npm run site-key -- create --business <slug> [--name "Customer website"]
 *   npm run site-key -- list --business <slug>
 *   npm run site-key -- revoke <prefix>
 *
 * A new key is printed once. Store it only in the website's DASHBOARD_SITE_KEY environment variable
 * (Vercel → Project → Settings → Environment Variables); only its hash is kept in the database.
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function businessBySlug(slug: string | undefined) {
  if (!slug) throw new Error("Pass --business <slug>.");
  const [biz] = await getDb().select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!biz) throw new Error(`No business with slug "${slug}".`);
  return biz;
}

async function main() {
  const command = process.argv[2];
  if (command === "create") {
    const biz = await businessBySlug(arg("business"));
    const created = await createSiteKey(biz.id, arg("name") ?? "Customer website");
    console.log(`Created a website API key for ${biz.name} (prefix ${created.prefix}).`);
    console.log("Copy it now into the website's DASHBOARD_SITE_KEY variable; it won't be shown again:\n");
    console.log(created.key);
  } else if (command === "list") {
    const biz = await businessBySlug(arg("business"));
    const rows = await getDb()
      .select({ prefix: apiKeys.prefix, name: apiKeys.name, scopes: apiKeys.scopes, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.businessId, biz.id))
      .orderBy(asc(apiKeys.createdAt));
    if (!rows.length) console.log(`No website API keys for ${biz.name}.`);
    for (const r of rows) {
      const state = r.revokedAt ? `revoked ${r.revokedAt.toISOString()}` : `active, last used ${r.lastUsedAt?.toISOString() ?? "never"}`;
      console.log(`${r.prefix}…  ${r.name}  [${r.scopes.join(", ")}]  ${state}`);
    }
  } else if (command === "revoke") {
    const prefix = process.argv[3];
    if (!prefix || prefix.length < 8) throw new Error("Pass the key prefix shown by `list` (at least 8 characters).");
    const rows = await getDb()
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(like(apiKeys.prefix, `${prefix.replace(/[%_\\]/g, "")}%`), isNull(apiKeys.revokedAt)))
      .returning({ prefix: apiKeys.prefix, name: apiKeys.name });
    if (!rows.length) console.log("No active key with that prefix.");
    for (const r of rows) console.log(`Revoked ${r.prefix}… (${r.name}).`);
  } else {
    console.error('Usage: npm run site-key -- create --business <slug> [--name "Customer website"] | list --business <slug> | revoke <prefix>');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
