import { sql } from "drizzle-orm";
import { z } from "zod";
import type { WeekHours, WebsiteContent } from "@/lib/types";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { appointmentTypes, branches, businesses, businessMemberships, expenseCategories, inventoryLocations, productCategories, users } from "@/server/db/schema";
import { audit, invalid, isUniqueViolation, systemCtx } from "./core";

/**
 * Creates a real (non-demo) business with its first owner, ready to configure in Settings.
 * Used by `npm run setup:business`; there is deliberately no public sign-up endpoint.
 */

export const DEFAULT_HOURS: WeekHours = {
  mon: { open: "10:00", close: "19:00" },
  tue: { open: "10:00", close: "19:00" },
  wed: { open: "10:00", close: "19:00" },
  thu: { open: "10:00", close: "19:00" },
  fri: { open: "10:00", close: "19:00" },
  sat: { open: "10:00", close: "19:00" },
  sun: null,
};

export const DEFAULT_CATEGORIES = [
  { name: "Frames", slug: "frames", kind: "frames" },
  { name: "Sunglasses", slug: "sunglasses", kind: "sunglasses" },
  { name: "Prescription lenses", slug: "prescription-lenses", kind: "rx_lenses" },
  { name: "Contact lenses", slug: "contact-lenses", kind: "contact_lenses" },
  { name: "Cleaning & care", slug: "cleaning-care", kind: "cleaning" },
  { name: "Cases", slug: "cases", kind: "cases" },
  { name: "Accessories", slug: "accessories", kind: "accessories" },
  { name: "Services", slug: "services", kind: "services" },
] as const;

export const DEFAULT_APPOINTMENT_TYPES = [
  { code: "eye_exam", name: "Comprehensive eye exam", description: "Refraction, eye-health screening and prescription.", durationMinutes: 45, requiresPractitioner: true, isPublic: true },
  { code: "contact_lens_fitting", name: "Contact lens fitting", description: "Measurements, trial lenses and handling lesson.", durationMinutes: 30, requiresPractitioner: true, isPublic: true },
  { code: "frame_consultation", name: "Frame & lens consultation", description: "Help choosing frames and lens options.", durationMinutes: 30, requiresPractitioner: false, isPublic: true },
  { code: "follow_up", name: "Follow-up check", description: "Review after a new prescription or fitting.", durationMinutes: 20, requiresPractitioner: true, isPublic: false },
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = ["Rent", "Payroll", "Utilities", "Laboratory fees", "Marketing", "Store supplies", "Maintenance & repairs", "Professional fees"];

const DEFAULT_WEBSITE: WebsiteContent = {
  heroEyebrow: "Eye care & eyewear",
  heroTitle: "Clear vision starts with a proper eye exam.",
  heroBody: "Book a comprehensive eye examination, find frames that fit, and get lenses made to your prescription.",
  aboutBody: "We provide eye examinations, prescription eyewear, sunglasses and contact lenses, with fittings and aftercare included.",
  values: [],
  faqs: [],
};

export const onboardingInput = z.object({
  businessName: z.string().trim().min(2, "Business name is required.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes.")
    .max(60)
    .optional(),
  ownerName: z.string().trim().min(2, "Owner name is required.").max(120),
  ownerEmail: z.email("Enter a valid owner email.").transform((v) => v.trim().toLowerCase()),
  ownerPassword: z.string(),
  branchName: z.string().trim().min(2).max(80).default("Main branch"),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/).default("MAIN"),
  timezone: z.string().default("Asia/Manila"),
  currency: z.string().length(3).toUpperCase().default("PHP"),
  locale: z.string().default("en-PH"),
  country: z.string().length(2).toUpperCase().default("PH"),
  taxName: z.string().trim().min(1).max(20).default("VAT"),
  taxRateBps: z.number().int().min(0).max(5000).default(1200),
  pricesIncludeTax: z.boolean().default(true),
});

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "business"
  );
}

export async function createBusinessWithOwner(raw: z.input<typeof onboardingInput>) {
  const input = onboardingInput.parse(raw);
  const problem = passwordProblem(input.ownerPassword);
  if (problem) throw invalid(problem, { ownerPassword: [problem] });
  try {
    Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw invalid(`Unknown time zone "${input.timezone}".`, { timezone: ["Use an IANA name such as Asia/Manila."] });
  }
  const passwordHash = await hashPassword(input.ownerPassword);
  const baseSlug = input.slug ?? slugify(input.businessName);

  return getDb().transaction(async (tx) => {
    // Find a free slug: name, name-2, name-3 …
    const taken = await tx.execute<{ slug: string }>(sql`select slug from businesses where slug = ${baseSlug} or slug like ${`${baseSlug}-%`}`);
    const used = new Set(taken.rows.map((r) => r.slug));
    if (input.slug && used.has(input.slug)) throw invalid(`The slug "${input.slug}" is already used.`, { slug: ["Already used."] });
    let slug = baseSlug;
    for (let i = 2; used.has(slug); i++) slug = `${baseSlug}-${i}`;

    const [biz] = await tx
      .insert(businesses)
      .values({
        slug,
        name: input.businessName,
        country: input.country,
        currency: input.currency,
        locale: input.locale,
        timezone: input.timezone,
        taxName: input.taxName,
        taxRateBps: input.taxRateBps,
        pricesIncludeTax: input.pricesIncludeTax,
        businessHours: DEFAULT_HOURS,
        websiteContent: DEFAULT_WEBSITE,
        settings: { maxStaffDiscountBps: 2000, appointmentsAuthority: "platform" },
        isDemo: false,
      })
      .returning();
    const [branch] = await tx.insert(branches).values({ businessId: biz.id, name: input.branchName, code: input.branchCode, sortOrder: 0 }).returning();
    await tx.insert(inventoryLocations).values({ businessId: biz.id, branchId: branch.id, name: `${input.branchName} stockroom`, code: `${input.branchCode}-STOCK` });
    await tx.insert(productCategories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, businessId: biz.id, sortOrder: i + 1 })));
    await tx.insert(appointmentTypes).values(DEFAULT_APPOINTMENT_TYPES.map((t, i) => ({ ...t, businessId: biz.id, sortOrder: i + 1 })));
    await tx.insert(expenseCategories).values(DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ businessId: biz.id, name, sortOrder: i })));

    const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = ${input.ownerEmail}`).limit(1);
    const user = existing ?? (await tx.insert(users).values({ email: input.ownerEmail, name: input.ownerName, passwordHash }).returning())[0];
    const [membership] = await tx.insert(businessMemberships).values({ businessId: biz.id, userId: user.id, role: "owner", title: "Owner", defaultBranchId: branch.id }).returning();
    await audit(tx, systemCtx(biz.id, "Setup"), { action: "business.created", entityType: "business", entityId: biz.id, summary: `Business "${biz.name}" created with owner ${input.ownerEmail}` });
    return { businessId: biz.id, slug, branchId: branch.id, userId: user.id, membershipId: membership.id, existingUser: Boolean(existing) };
  }).catch((error) => {
    if (isUniqueViolation(error)) throw invalid("That business slug or branch code is already in use. Try again with --slug.");
    throw error;
  });
}
