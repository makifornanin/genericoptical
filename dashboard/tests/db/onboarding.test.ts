import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { appointmentTypes, businesses, inventoryLocations, productCategories } from "@/server/db/schema";
import { authenticate, resolveSession } from "@/server/services/auth";
import * as catalog from "@/server/services/catalog";
import { createBusinessWithOwner, slugify } from "@/server/services/onboarding";

const uniq = () => Math.random().toString(36).slice(2, 8);

describe("business onboarding", () => {
  it("creates a usable business whose owner can sign in and start trading", async () => {
    const email = `owner-${uniq()}@clearoptics.example`;
    const res = await createBusinessWithOwner({ businessName: "Clear Optics Ñ", ownerName: "Ana Cruz", ownerEmail: email.toUpperCase(), ownerPassword: "Sturdy-pass-2026" });
    expect(res.slug).toMatch(/^clear-optics-n/);

    const [biz] = await getDb().select().from(businesses).where(eq(businesses.id, res.businessId));
    expect(biz).toMatchObject({ isDemo: false, currency: "PHP", timezone: "Asia/Manila", taxRateBps: 1200, pricesIncludeTax: true });
    expect(await getDb().select().from(productCategories).where(eq(productCategories.businessId, res.businessId))).toHaveLength(8);
    expect(await getDb().select().from(appointmentTypes).where(eq(appointmentTypes.businessId, res.businessId))).toHaveLength(4);
    const [loc] = await getDb().select().from(inventoryLocations).where(eq(inventoryLocations.businessId, res.businessId));
    expect(loc.branchId).toBe(res.branchId);

    // Email is normalised; the owner can sign in and holds every permission.
    const { token } = await authenticate(email, "Sturdy-pass-2026");
    const session = await resolveSession(token);
    expect(session?.membership.role).toBe("owner");
    expect(session?.ctx.permissions.has("settings.manage")).toBe(true);

    const [frames] = await getDb().select().from(productCategories).where(eq(productCategories.businessId, res.businessId)).limit(1);
    const product = await catalog.createProduct(session!.ctx, { name: "First frame", categoryId: frames.id, productType: "stock", variants: [{ sku: `FF-${uniq()}`, label: "Default", priceCents: 250000, costCents: 90000, reorderPoint: 1, reorderQty: 2 }] }, [{ variantIndex: 0, locationId: loc.id, quantity: 3 }]);
    expect(product?.productId).toBeTruthy();
  });

  it("picks a free slug, and refuses an explicit slug that is taken", async () => {
    const name = `Sunrise Eye ${uniq()}`;
    const a = await createBusinessWithOwner({ businessName: name, ownerName: "A Owner", ownerEmail: `a-${uniq()}@example.com`, ownerPassword: "Sturdy-pass-2026" });
    const b = await createBusinessWithOwner({ businessName: name, ownerName: "B Owner", ownerEmail: `b-${uniq()}@example.com`, ownerPassword: "Sturdy-pass-2026" });
    expect(a.slug).toBe(slugify(name));
    expect(b.slug).toBe(`${slugify(name)}-2`);
    await expect(createBusinessWithOwner({ businessName: "Other", slug: a.slug, ownerName: "C Owner", ownerEmail: `c-${uniq()}@example.com`, ownerPassword: "Sturdy-pass-2026" })).rejects.toThrow(/already used/);
  });

  it("rejects weak passwords and unknown time zones before writing anything", async () => {
    const before = (await getDb().select({ id: businesses.id }).from(businesses)).length;
    await expect(createBusinessWithOwner({ businessName: "Weak Co", ownerName: "W Owner", ownerEmail: `w-${uniq()}@example.com`, ownerPassword: "short" })).rejects.toThrow(/at least 10/);
    await expect(createBusinessWithOwner({ businessName: "Zone Co", ownerName: "Z Owner", ownerEmail: `z-${uniq()}@example.com`, ownerPassword: "Sturdy-pass-2026", timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);
    expect((await getDb().select({ id: businesses.id }).from(businesses)).length).toBe(before);
  });
});
