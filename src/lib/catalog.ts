import type { Branch, CategoryRef, Interest, ProductSummary, Service } from "./api-types";

/* How the API's data maps onto the existing page sections. Client-safe (no server APIs). */

function kindOf(c: { kind: string; slug: string }): string {
  return `${c.kind} ${c.slug}`.toLowerCase().replace(/-/g, "_");
}
export function isContactLens(c: { kind: string; slug: string }): boolean {
  return kindOf(c).includes("contact");
}
export function isSunglasses(c: { kind: string; slug: string }): boolean {
  return kindOf(c).includes("sunglass");
}
export function isFrames(c: { kind: string; slug: string }): boolean {
  return !isSunglasses(c) && kindOf(c).includes("frame");
}

/** Frames, then sunglasses, keeping the API's order within each (the API has no "featured" flag). */
export function eyewearFirst(products: ProductSummary[]): ProductSummary[] {
  return [...products.filter((p) => isFrames(p.category)), ...products.filter((p) => isSunglasses(p.category))];
}

/** Home "Eyewear" row: the first 8 frames + sunglasses. */
export function featuredProducts(products: ProductSummary[]): ProductSummary[] {
  return eyewearFirst(products).slice(0, 8);
}

/** Hero art: the first three products that have an image (eyewear first). */
export function heroProducts(products: ProductSummary[]): ProductSummary[] {
  const eyewear = eyewearFirst(products);
  const rest = products.filter((p) => !eyewear.includes(p));
  return [...eyewear, ...rest].filter((p) => p.imageUrl).slice(0, 3);
}

/** Booking service for a product page: frames/sunglasses → consultation, contact lenses → lens service. */
export function bookingServiceFor(category: CategoryRef, services: Service[]): { service: Service; label: string } | null {
  if (!services.length) return null;
  const code = (s: Service) => s.code.toLowerCase();
  if (isContactLens(category)) {
    const s = services.find((x) => code(x).includes("contact_lens")) ?? services[0];
    return { service: s, label: "Book a lens consultation" };
  }
  if (isFrames(category) || isSunglasses(category)) {
    const s = services.find((x) => code(x).includes("consult") && !code(x).includes("contact_lens")) ?? services.find((x) => code(x).includes("consult")) ?? services[0];
    return { service: s, label: "Book a fitting" };
  }
  return null;
}

export function interestForCategory(category: CategoryRef): Interest {
  if (isContactLens(category)) return "contact_lenses";
  if (isSunglasses(category)) return "sunglasses";
  if (isFrames(category)) return "frames";
  return "other";
}

export function interestForService(service: Service | null): Interest {
  const c = service?.code.toLowerCase() ?? "";
  if (c.includes("contact_lens")) return "contact_lenses";
  if (c.includes("exam")) return "eye_exam";
  if (c.includes("repair") || c.includes("adjust")) return "repair";
  if (c.includes("consult")) return "prescription_glasses";
  return "eye_exam";
}

/** A deep-link value (?branch=) may be a branch id or its code (case-insensitive). */
export function findBranch(branches: Branch[], value: string | null | undefined): Branch | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return branches.find((b) => b.id.toLowerCase() === v || (b.code ?? "").toLowerCase() === v) ?? null;
}

/** A deep-link value (?service=) is a service code (or id). */
export function findService(services: Service[], value: string | null | undefined): Service | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return services.find((s) => s.code.toLowerCase() === v || s.id.toLowerCase() === v) ?? null;
}

export function branchParam(b: Branch): string {
  return b.code ? b.code.toLowerCase() : b.id;
}

export function calendarFor(service: Service | null, branch: Branch | null): string | null {
  if (!service || !branch) return null;
  return service.calendars.find((c) => c.branchId === branch.id)?.calendarId ?? null;
}
