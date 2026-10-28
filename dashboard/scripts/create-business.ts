import "./load-env";
import { randomBytes } from "node:crypto";
import { closeDb } from "@/server/db";
import { createBusinessWithOwner } from "@/server/services/onboarding";

/**
 * Creates a real business and its first owner account.
 *
 *   npm run setup:business -- --name "Clear Optics" --owner-email owner@clearoptics.ph --owner-name "Ana Cruz"
 *
 * Optional: --slug clear-optics  --branch "Makati"  --branch-code MKT  --timezone Asia/Manila
 *           --currency PHP  --locale en-PH  --country PH  --tax-name VAT  --tax-rate 12  --tax-exclusive
 * The owner password comes from OWNER_PASSWORD, or a strong one is generated and printed once.
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const ownerEmail = arg("owner-email");
  const ownerName = arg("owner-name");
  if (!name || !ownerEmail || !ownerName) {
    console.error('Usage: npm run setup:business -- --name "Business name" --owner-email you@example.com --owner-name "Your Name" [--slug …] [--branch …]');
    process.exitCode = 1;
    return;
  }
  const generated = !process.env.OWNER_PASSWORD;
  // Letters and digits guaranteed, so it always passes the password policy.
  const password = process.env.OWNER_PASSWORD ?? `${randomBytes(12).toString("base64url")}a1`;
  const taxRate = arg("tax-rate");
  const res = await createBusinessWithOwner({
    businessName: name,
    slug: arg("slug"),
    ownerEmail,
    ownerName,
    ownerPassword: password,
    branchName: arg("branch"),
    branchCode: arg("branch-code"),
    timezone: arg("timezone"),
    currency: arg("currency"),
    locale: arg("locale"),
    country: arg("country"),
    taxName: arg("tax-name"),
    taxRateBps: taxRate !== undefined ? Math.round(Number(taxRate) * 100) : undefined,
    pricesIncludeTax: process.argv.includes("--tax-exclusive") ? false : undefined,
  });
  console.log(`\nCreated "${name}" (slug: ${res.slug}).`);
  if (res.existingUser) console.log(`${ownerEmail} already had an account; it was added as owner and its password was not changed.`);
  else if (generated) console.log(`Owner sign-in: ${ownerEmail}\nTemporary password (shown once): ${password}\nChange it after signing in.`);
  else console.log(`Owner sign-in: ${ownerEmail} (password from OWNER_PASSWORD).`);
  console.log("\nNext: sign in, then open Settings to add branding, hours, branches, prices and website content.");
  if (!process.env.SITE_BUSINESS_SLUG) console.log(`Set SITE_BUSINESS_SLUG=${res.slug} so the public website shows this business.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
