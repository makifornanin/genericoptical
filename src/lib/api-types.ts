/*
 * Types for the dashboard's public website API v1 (contract: docs/PUBLIC_API.md in the dashboard
 * repository). Responses are normalised in src/lib/api.ts, so optional/nullable fields are always
 * present with the types below.
 */

export type Availability = "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "service";
export type BranchAvailability = "in_stock" | "low_stock" | "out_of_stock";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
/** 24h "HH:MM" open/close, or null when closed that day. */
export type DayHours = { open: string; close: string } | null;
export type WeeklyHours = Record<DayKey, DayHours>;

export interface Business {
  name: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  timezone: string;
  currency: string;
  locale: string;
  taxName: string | null;
  pricesIncludeTax: boolean;
  brandColor: string | null;
  accentColor: string | null;
  isDemo: boolean;
}

export interface WebsiteValue {
  title: string;
  body: string;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface WebsiteContent {
  heroEyebrow: string | null;
  heroTitle: string | null;
  heroBody: string | null;
  aboutTitle: string | null;
  aboutBody: string | null;
  values: WebsiteValue[];
  faqs: Faq[];
  privacyContactEmail: string | null;
}

export interface Branch {
  id: string;
  code: string | null;
  name: string;
  address: string[];
  phone: string | null;
  email: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  hours: WeeklyHours;
}

export interface ServiceCalendar {
  branchId: string;
  calendarId: string;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  /** null = price on request */
  priceCents: number | null;
  calendars: ServiceCalendar[];
}

export interface InBranchService {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  fromPrice: boolean;
}

export interface Category {
  slug: string;
  name: string;
  kind: string;
  productCount: number;
}

export interface BookingConfig {
  /** Official GoHighLevel booking-widget base, e.g. https://api.leadconnectorhq.com/widget/booking/ */
  widgetBase: string | null;
  ghlConnected: boolean;
}

export interface SiteData {
  business: Business;
  content: WebsiteContent;
  branches: Branch[];
  services: Service[];
  inBranchServices: InBranchService[];
  categories: Category[];
  booking: BookingConfig;
  generatedAt: string | null;
}

export interface CategoryRef {
  slug: string;
  name: string;
  kind: string;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: CategoryRef;
  description: string | null;
  /** Absolute URL (dashboard origin or its storage), or null. */
  imageUrl: string | null;
  priceFromCents: number | null;
  priceToCents: number | null;
  variantCount: number;
  availability: Availability;
  updatedAt: string | null;
}

export interface VariantBranch {
  branchId: string;
  branchName: string;
  availability: BranchAvailability;
}

export interface ProductVariant {
  id: string;
  label: string;
  options: Record<string, string>;
  priceCents: number | null;
  sku: string | null;
  availability: Availability;
  branches: VariantBranch[];
}

export interface ProductDetail extends ProductSummary {
  attributes: Record<string, string>;
  variants: ProductVariant[];
  related: ProductSummary[];
}

export const INQUIRY_KINDS = ["contact", "product_inquiry", "appointment_request"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export const INTERESTS = ["eye_exam", "prescription_glasses", "contact_lenses", "sunglasses", "frames", "repair", "other"] as const;
export type Interest = (typeof INTERESTS)[number];

/** Body of POST /api/public/v1/inquiries (and of this site's own POST /api/inquiry). */
export interface InquiryPayload {
  fullName: string;
  email: string | null;
  phone: string | null;
  interest: Interest;
  preferredBranchId: string | null;
  message: string | null;
  smsConsent: boolean;
  marketingConsent: boolean;
  kind: InquiryKind;
  productName: string | null;
  sourcePage: string | null;
  website: string;
}
