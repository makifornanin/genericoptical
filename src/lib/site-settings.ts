import type { Interest } from "./api-types";

/*
 * Website settings the dashboard API does not provide (it supplies the business, copy, branches,
 * services, FAQs and products). Everything here is public, non-secret presentation config: change it
 * here and redeploy. Business data must NOT be added here — it belongs in the dashboard.
 */

export interface NavItem {
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { label: "Eyewear", href: "/eyewear" },
  { label: "Services", href: "/services" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export const HEADER_CTA: NavItem = { label: "Book an exam", href: "/book" };

/** Thin banner above the header. Off by default; set enabled: true and fill in the text. */
export const PROMO = {
  enabled: false,
  strong: "",
  text: "",
  linkLabel: "",
  href: "",
};

/**
 * When the dashboard marks the business as a demo (business.isDemo), the banner says so — sample
 * names, prices and branches must never pass as a real business. Set false only for screenshots.
 */
export const SHOW_DEMO_NOTICE = true;

/** Social profiles shown in the footer (opens in a new tab). Empty = hidden. */
export const SOCIAL: NavItem[] = [
  // { label: "Facebook", href: "https://facebook.com/yourpage" },
  // { label: "Instagram", href: "https://instagram.com/yourpage" },
];

/** Optional "Staff sign in" link in the footer (the dashboard URL). Empty = hidden. */
export const STAFF_LOGIN_URL = "";

/** Used in the contact and FAQ copy and in form confirmations. */
export const REPLY_TIME = "usually within one business day";

/** Appended to the tax sentence under the catalogue. */
export const PRICE_NOTE = "Prescription lenses are priced separately based on your prescription and lens options; availability varies by branch.";

/** Shown on product pages under the availability. */
export const ORDERING_NOTE = "Online ordering isn't available yet — we'll reserve it for you to try in branch.";

/**
 * Testimonials (home page). Disabled by default: the items below are placeholder text. To enable,
 * replace them with real, attributable reviews you have permission to publish, set sample: false
 * and enabled: true. While sample is true a visible "Sample reviews" notice and tags are shown.
 */
export const TESTIMONIALS = {
  enabled: false,
  sample: true,
  items: [
    { quote: "They explained every number on my prescription and never once pushed the most expensive lenses.", name: "Sample customer", context: "Eye exam" },
    { quote: "My first contact lens fitting — patient, unhurried and I left knowing exactly how to care for them.", name: "Sample customer", context: "Contact lenses" },
    { quote: "Dropped off a frame with a loose hinge and it was fixed while I had a coffee.", name: "Sample customer", context: "Repairs" },
  ],
};

/**
 * Privacy and Terms are DRAFT text. While true, both pages show a visible "Draft — needs legal
 * review" notice. Have the text reviewed for the business and its jurisdiction, then set false.
 */
export const LEGAL_DRAFT = true;
export const LEGAL = {
  lastUpdated: "2026-10-16",
  /** e.g. "the Philippines (Data Privacy Act of 2012)"; empty = "applicable data-protection law". */
  jurisdiction: "",
};

/** Labels for the inquiry form's "I'm interested in" options (values match the API contract). */
export const INTEREST_OPTIONS: { value: Interest; label: string }[] = [
  { value: "eye_exam", label: "Eye examination" },
  { value: "prescription_glasses", label: "Prescription glasses" },
  { value: "contact_lenses", label: "Contact lenses" },
  { value: "sunglasses", label: "Sunglasses" },
  { value: "frames", label: "Frames only" },
  { value: "repair", label: "Repair / adjustment" },
  { value: "other", label: "Other" },
];

/** Template copy used only when the dashboard's Settings → Website fields are empty. */
export const DEFAULT_COPY = {
  heroTitle: "Clear vision, unhurried care, and frames that feel like you.",
  heroBody: "Comprehensive eye examinations, prescription eyewear and contact lens fittings — with optometrists who take the time to explain your options.",
  aboutTitle: "It starts with listening.",
  aboutBody:
    "Choosing eyewear is about more than picking a frame. We begin with a thorough examination, explain what we find in plain language, and help you weigh lens and frame options against how you actually live — screens, sport, driving, reading.\n\nFrom the first check to the final fitting, every visit is meant to feel considered and never rushed.",
  values: [
    { title: "Thorough eye exams", body: "Refraction, eye-health screening and a clear explanation of your prescription." },
    { title: "Honest guidance", body: "Lens and frame recommendations that fit your needs and budget." },
    { title: "Made-to-measure lenses", body: "Single vision, progressives and specialty lenses from our partner laboratory." },
    { title: "Aftercare included", body: "Free adjustments and fit checks for the life of your frames." },
  ],
};

/** Header/footer name while the business profile can't be loaded. */
export const FALLBACK_BRAND = "Eye care & eyewear";
