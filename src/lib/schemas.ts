import { z } from "zod";

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Optional free text: trims, turns "" into null. */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const reqText = (label: string, max = 200) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `Keep ${label.toLowerCase()} under ${max} characters.`);

export const optEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullish()
  .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address.");

export const optPhone = z
  .string()
  .trim()
  .max(40)
  .transform((v) => (v === "" ? null : v))
  .nullish()
  .refine((v) => !v || (/^[+()0-9\s.-]{6,40}$/.test(v) && v.replace(/\D/g, "").length >= 7), "Enter a valid phone number (at least 7 digits).");

export const uuid = z.uuid("Invalid reference.");
export const optUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const cents = z.number({ error: "Enter an amount." }).int("Amounts must be in whole minor units.").min(0, "Amounts can't be negative.").max(1e12);
export const positiveCents = cents.refine((v) => v > 0, "Enter an amount greater than zero.");
export const qty = z.number({ error: "Enter a quantity." }).int("Use whole numbers.").min(1, "Quantity must be at least 1.").max(100_000);
export const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
export const optDay = z
  .union([dayString, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
export const idempotencyKey = z.string().trim().min(8).max(100);

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "gcash", "maya", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Credit / debit card",
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  maya: "Maya",
  other: "Other (manual)",
  balance_adjustment: "Credit to balance",
};

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

// ─── Customers ───────────────────────────────────────────────────────────────

export const customerInput = z.object({
  firstName: reqText("First name", 80),
  lastName: reqText("Last name", 80),
  email: optEmail,
  phone: optPhone,
  birthDate: optDay,
  gender: optText(30),
  addressLine1: optText(200),
  city: optText(80),
  notes: optText(2000),
  source: optText(60),
  status: z.enum(["active", "inactive"]).default("active"),
  homeBranchId: optUuid,
  marketingConsent: z.boolean().default(false),
  smsConsent: z.boolean().default(false),
});
export type CustomerInput = z.input<typeof customerInput>;

const diopter = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= -30 && v <= 30), "Enter a value between -30.00 and +30.00.");
const axis = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 180), "Axis is 0–180.");

export const prescriptionInput = z.object({
  customerId: uuid,
  kind: z.enum(["spectacles", "contact_lens"]).default("spectacles"),
  examinedOn: dayString,
  expiresOn: optDay,
  practitionerMembershipId: optUuid,
  odSphere: diopter,
  odCylinder: diopter,
  odAxis: axis,
  odAdd: diopter,
  osSphere: diopter,
  osCylinder: diopter,
  osAxis: axis,
  osAdd: diopter,
  pdDistance: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (v >= 40 && v <= 80), "PD is usually 40–80 mm."),
  notes: optText(2000),
});

// ─── Leads ───────────────────────────────────────────────────────────────────

export const LEAD_STAGES = ["new", "contacted", "qualified", "appointment_scheduled", "follow_up", "converted", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New lead",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_scheduled: "Appointment scheduled",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};
export const LEAD_SOURCES = ["website", "walk_in", "phone", "facebook", "instagram", "referral", "gohighlevel", "other"] as const;
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  walk_in: "Walk-in",
  phone: "Phone",
  facebook: "Facebook",
  instagram: "Instagram",
  referral: "Referral",
  gohighlevel: "GoHighLevel",
  other: "Other",
};
export const LEAD_INTERESTS = ["eye_exam", "prescription_glasses", "contact_lenses", "sunglasses", "frames", "repair", "other"] as const;
export const LEAD_INTEREST_LABELS: Record<string, string> = {
  eye_exam: "Eye examination",
  prescription_glasses: "Prescription glasses",
  contact_lenses: "Contact lenses",
  sunglasses: "Sunglasses",
  frames: "Frames only",
  repair: "Repair / adjustment",
  other: "Other",
};

export const leadInput = z.object({
  firstName: reqText("First name", 80),
  lastName: z.string().trim().max(80).default(""),
  email: optEmail,
  phone: optPhone,
  source: z.enum(LEAD_SOURCES).default("walk_in"),
  interest: z.enum(LEAD_INTERESTS).nullish(),
  message: optText(2000),
  assignedMembershipId: optUuid,
  preferredBranchId: optUuid,
  followUpAt: z.union([z.string().datetime({ offset: true }), z.literal(""), z.null()]).optional().transform((v) => (v ? new Date(v) : null)),
  estimatedValueCents: cents.nullish(),
  smsConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
});
export type LeadInput = z.input<typeof leadInput>;

/** Public website lead form. Requires email or phone so staff can respond. */
export const publicLeadInput = z
  .object({
    fullName: reqText("Your name", 120),
    email: optEmail,
    phone: optPhone,
    interest: z.enum(LEAD_INTERESTS).default("other"),
    preferredBranchId: optUuid,
    message: optText(2000),
    smsConsent: z.boolean().default(false),
    marketingConsent: z.boolean().default(false),
    /** Honeypot: real users never fill this. */
    website: z.string().max(500).optional().default(""),
    kind: z.enum(["contact", "product_inquiry", "appointment_request"]).default("contact"),
    productName: optText(200),
  })
  .refine((v) => v.email || v.phone, { message: "Add an email address or phone number so we can reply.", path: ["email"] });

// ─── Catalogue ───────────────────────────────────────────────────────────────

export const CATEGORY_KINDS = ["frames", "rx_lenses", "contact_lenses", "sunglasses", "accessories", "cleaning", "cases", "services"] as const;
export const PRODUCT_TYPES = ["stock", "service", "made_to_order"] as const;
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  stock: "Stocked item",
  service: "Service (not stocked)",
  made_to_order: "Made to order (lab)",
};

export const variantInput = z.object({
  id: optUuid,
  sku: reqText("SKU", 60).regex(/^[A-Za-z0-9._\-/]+$/, "Use letters, numbers, dot, dash, slash or underscore."),
  barcode: optText(60),
  label: z.string().trim().max(120).default("Default"),
  options: z.record(z.string(), z.string().max(80)).default({}),
  priceCents: cents,
  costCents: cents.default(0),
  reorderPoint: z.number().int().min(0).max(100000).default(0),
  reorderQty: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});

export const productInput = z.object({
  name: reqText("Product name", 160),
  brand: optText(80),
  description: optText(4000),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .refine((v) => !v || /^(https:\/\/|\/)[^\s]+$/.test(v), "Use an https:// URL or a /path."),
  categoryId: uuid,
  supplierId: optUuid,
  productType: z.enum(PRODUCT_TYPES).default("stock"),
  taxExempt: z.boolean().default(false),
  showOnWebsite: z.boolean().default(false),
  isActive: z.boolean().default(true),
  attributes: z.record(z.string(), z.string().max(120)).default({}),
  variants: z.array(variantInput).min(1, "Add at least one variant.").max(60),
});
export type ProductInput = z.input<typeof productInput>;

// ─── Inventory ───────────────────────────────────────────────────────────────

export const adjustmentInput = z.object({
  variantId: uuid,
  locationId: uuid,
  mode: z.enum(["add", "remove", "set", "damage"]),
  quantity: z.number().int().min(0).max(100000),
  reason: reqText("Reason", 300),
  idempotencyKey,
});

export const transferInput = z
  .object({
    variantId: uuid,
    fromLocationId: uuid,
    toLocationId: uuid,
    quantity: qty,
    reason: reqText("Reason", 300),
    idempotencyKey,
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, { message: "Choose two different locations.", path: ["toLocationId"] });

// ─── Purchasing ──────────────────────────────────────────────────────────────

export const supplierInput = z.object({
  code: reqText("Code", 20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only."),
  name: reqText("Supplier name", 120),
  contactName: optText(120),
  email: optEmail,
  phone: optPhone,
  address: optText(300),
  paymentTerms: optText(80),
  leadTimeDays: z.number().int().min(0).max(365).nullish(),
  notes: optText(2000),
  isActive: z.boolean().default(true),
});

export const purchaseOrderInput = z.object({
  supplierId: uuid,
  locationId: uuid,
  expectedOn: optDay,
  notes: optText(2000),
  items: z
    .array(z.object({ variantId: uuid, quantity: qty, unitCostCents: cents }))
    .min(1, "Add at least one item.")
    .max(200)
    .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, "Each product can only appear once."),
});

export const receiveInput = z.object({
  purchaseOrderId: uuid,
  items: z.array(z.object({ itemId: uuid, quantity: z.number().int().min(0).max(100000) })).min(1),
  notes: optText(1000),
  idempotencyKey,
});

// ─── Sales & orders ──────────────────────────────────────────────────────────

export const saleLineInput = z.object({
  variantId: uuid,
  quantity: qty,
  lineDiscountCents: cents.default(0),
  /** Only honoured for made-to-order lines (lab cost varies per job). */
  unitCostCents: cents.nullish(),
  /** Only honoured for made-to-order and service lines (price set per job). */
  unitPriceCents: cents.nullish(),
  prescriptionId: optUuid,
  notes: optText(300),
});

export const orderDiscountInput = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("percent"), valueBps: z.number().int().min(0).max(10000) }),
    z.object({ type: z.literal("amount"), valueCents: cents }),
  ])
  .nullish();

export const paymentLineInput = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountCents: positiveCents,
  tenderedCents: cents.nullish(),
  reference: optText(80),
});

export const checkoutInput = z.object({
  branchId: uuid,
  customerId: optUuid,
  items: z.array(saleLineInput).min(1, "Add at least one item.").max(100),
  orderDiscount: orderDiscountInput,
  payments: z.array(paymentLineInput).max(5).default([]),
  notes: optText(1000),
  idempotencyKey,
});
export type CheckoutInput = z.input<typeof checkoutInput>;

export const FULFILLMENT_STAGES = ["new", "confirmed", "processing", "awaiting_lab", "ready_for_pickup", "completed", "cancelled"] as const;
export type FulfillmentStage = (typeof FULFILLMENT_STAGES)[number];
export const FULFILLMENT_LABELS: Record<FulfillmentStage, string> = {
  new: "New order",
  confirmed: "Confirmed",
  processing: "Processing",
  awaiting_lab: "Awaiting supplier / lab",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const orderInput = z.object({
  branchId: uuid,
  customerId: uuid,
  items: z.array(saleLineInput).min(1, "Add at least one item.").max(100),
  orderDiscount: orderDiscountInput,
  deposit: paymentLineInput.nullish(),
  dueOn: optDay,
  labSupplierId: optUuid,
  labReference: optText(80),
  notes: optText(2000),
  confirm: z.boolean().default(false),
  idempotencyKey,
});
export type OrderInput = z.input<typeof orderInput>;

export const paymentInput = paymentLineInput.extend({ saleId: uuid, notes: optText(300), idempotencyKey });

export const refundInput = z.object({
  saleId: uuid,
  items: z.array(z.object({ saleItemId: uuid, quantity: qty, restock: z.boolean() })).default([]),
  /** Required when no items are returned (e.g. deposit refund or goodwill credit). */
  amountCents: positiveCents.nullish(),
  method: z.enum([...PAYMENT_METHODS, "balance_adjustment"]),
  reason: reqText("Reason", 300),
  idempotencyKey,
});

// ─── Appointments ────────────────────────────────────────────────────────────

export const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const appointmentInput = z
  .object({
    branchId: uuid,
    appointmentTypeId: uuid,
    customerId: optUuid,
    leadId: optUuid,
    practitionerMembershipId: optUuid,
    /** Local date + time in the business time zone. */
    date: dayString,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time."),
    durationMinutes: z.number().int().min(5).max(480).nullish(),
    notes: optText(2000),
    guestName: optText(120),
    guestPhone: optPhone,
    guestEmail: optEmail,
  })
  .refine((v) => v.customerId || v.leadId || v.guestName, { message: "Choose a customer or lead, or enter a guest name.", path: ["customerId"] });

export const publicAppointmentInput = z.object({
  fullName: reqText("Your name", 120),
  email: optEmail,
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Add a phone number (at least 7 digits) so we can confirm."),
  branchId: uuid,
  appointmentTypeId: uuid,
  date: dayString,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  message: optText(1000),
  smsConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  website: z.string().max(500).optional().default(""),
});

// ─── Expenses ────────────────────────────────────────────────────────────────

export const expenseInput = z.object({
  categoryId: uuid,
  branchId: optUuid,
  amountCents: positiveCents,
  expenseDate: dayString,
  paymentMethod: optText(40),
  payee: optText(120),
  description: reqText("Description", 300),
  reference: optText(80),
});
