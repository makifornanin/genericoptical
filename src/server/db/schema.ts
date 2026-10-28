import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BusinessSettings, PermissionOverrides, WebsiteContent, WeekHours } from "@/lib/types";

// ─── Column helpers ──────────────────────────────────────────────────────────

const id = () => uuid("id").primaryKey().defaultRandom();
const businessId = () =>
  uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Money in integer minor units (centavos/cents). */
const money = (name: string) => bigint(name, { mode: "number" });

// ─── Enums ───────────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", ["owner", "manager", "sales", "inventory", "practitioner"]);
export const productType = pgEnum("product_type", ["stock", "service", "made_to_order"]);
export const categoryKind = pgEnum("category_kind", [
  "frames",
  "rx_lenses",
  "contact_lenses",
  "sunglasses",
  "accessories",
  "cleaning",
  "cases",
  "services",
]);
export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "qualified",
  "appointment_scheduled",
  "follow_up",
  "converted",
  "lost",
]);
export const appointmentStatus = pgEnum("appointment_status", ["scheduled", "confirmed", "completed", "cancelled", "no_show"]);
export const saleKind = pgEnum("sale_kind", ["pos", "order"]);
export const saleStatus = pgEnum("sale_status", ["open", "completed", "cancelled"]);
export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "new",
  "confirmed",
  "processing",
  "awaiting_lab",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);
export const paymentStatus = pgEnum("payment_status", ["unpaid", "partially_paid", "paid"]);
/** online_demo: the website's simulated card payment (demo store) — no money moves; never offered to staff. */
export const paymentMethod = pgEnum("payment_method", ["cash", "card", "bank_transfer", "gcash", "maya", "other", "ghl_online", "online_demo"]);
export const refundMethod = pgEnum("refund_method", [
  "cash",
  "card",
  "bank_transfer",
  "gcash",
  "maya",
  "other",
  "balance_adjustment",
]);
export const movementType = pgEnum("movement_type", [
  "opening",
  "receipt",
  "adjustment",
  "sale",
  "sale_return",
  "order_consumption",
  "transfer_out",
  "transfer_in",
  "damage",
  "count",
]);
export const reservationStatus = pgEnum("reservation_status", ["active", "released", "consumed"]);
export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);
export const syncDirection = pgEnum("sync_direction", ["inbound", "outbound"]);

/** Connection lifecycle. `reauth_required` = the refresh token was rejected; an owner must reconnect. */
export const INTEGRATION_STATUSES = ["not_configured", "connected", "error", "disabled", "reauth_required"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
/**
 * Sync event lifecycle: pending -> processing -> synced | skipped | retry_scheduled -> ... | failed (gave up)
 * | needs_review (a person must decide, e.g. a conflict). "synced" is only set after the external
 * system confirmed the operation.
 */
export const SYNC_STATUSES = ["pending", "processing", "synced", "retry_scheduled", "failed", "needs_review", "skipped"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export const SYNC_CATEGORIES = ["contacts", "opportunities", "appointments", "products", "inventory", "sales", "orders", "system"] as const;
export type SyncCategory = (typeof SYNC_CATEGORIES)[number];
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// ─── Tenancy & identity ──────────────────────────────────────────────────────

export const businesses = pgTable("businesses", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  tagline: text("tagline"),
  description: text("description"),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").notNull().default("#1F2B22"),
  accentColor: text("accent_color").notNull().default("#B5E14A"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country").notNull().default("PH"),
  currency: text("currency").notNull().default("PHP"),
  locale: text("locale").notNull().default("en-PH"),
  timezone: text("timezone").notNull().default("Asia/Manila"),
  taxName: text("tax_name").notNull().default("VAT"),
  taxRateBps: integer("tax_rate_bps").notNull().default(1200),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),
  taxRegistration: text("tax_registration"),
  receiptFooter: text("receipt_footer"),
  businessHours: jsonb("business_hours").$type<WeekHours>().notNull(),
  websiteContent: jsonb("website_content").$type<WebsiteContent>().notNull().default({}),
  settings: jsonb("settings").$type<BusinessSettings>().notNull().default({}),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("businesses_tax_rate_range", sql`${t.taxRateBps} >= 0 and ${t.taxRateBps} <= 10000`)]);

export const branches = pgTable(
  "branches",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    phone: text("phone"),
    email: text("email"),
    mapUrl: text("map_url"),
    imageUrl: text("image_url"),
    businessHours: jsonb("business_hours").$type<WeekHours>(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.businessId, t.code), unique("branches_business_id_id_key").on(t.businessId, t.id)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`)],
);

export const businessMemberships = pgTable(
  "business_memberships",
  {
    id: id(),
    businessId: businessId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    defaultBranchId: uuid("default_branch_id"),
    title: text("title"),
    phone: text("phone"),
    calendarColor: text("calendar_color"),
    takesAppointments: boolean("takes_appointments").notNull().default(false),
    permissionOverrides: jsonb("permission_overrides").$type<PermissionOverrides>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.businessId, t.userId),
    unique("business_memberships_business_id_id_key").on(t.businessId, t.id),
    foreignKey({ columns: [t.businessId, t.defaultBranchId], foreignColumns: [branches.businessId, branches.id] }),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 hex digest of the session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index().on(t.userId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    ip: text("ip"),
    succeeded: boolean("succeeded").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_email_idx").on(sql`lower(${t.email})`, t.createdAt)],
);

export const businessSequences = pgTable(
  "business_sequences",
  {
    businessId: businessId(),
    key: text("key").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.key] })],
);

// ─── CRM ─────────────────────────────────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: id(),
    businessId: businessId(),
    code: text("code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date"),
    gender: text("gender"),
    addressLine1: text("address_line1"),
    city: text("city"),
    notes: text("notes"),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    source: text("source"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    smsConsent: boolean("sms_consent").notNull().default(false),
    homeBranchId: uuid("home_branch_id"),
    convertedFromLeadId: uuid("converted_from_lead_id"),
    externalGhlContactId: text("external_ghl_contact_id"),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    unique().on(t.businessId, t.code),
    unique("customers_business_id_id_key").on(t.businessId, t.id),
    unique("customers_converted_lead_key").on(t.businessId, t.convertedFromLeadId),
    unique("customers_ghl_contact_key").on(t.businessId, t.externalGhlContactId),
    index().on(t.businessId, t.createdAt),
    index("customers_email_idx").on(t.businessId, sql`lower(${t.email})`),
    index("customers_name_idx").on(t.businessId, sql`lower(${t.lastName})`, sql`lower(${t.firstName})`),
    foreignKey({ columns: [t.businessId, t.homeBranchId], foreignColumns: [branches.businessId, branches.id] }),
    // (business_id, converted_from_lead_id) → leads(business_id, id) is added in migration
    // 0003 — declaring it here would create a customers ⇄ leads type cycle.
    foreignKey({
      columns: [t.businessId, t.createdByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: id(),
    businessId: businessId(),
    customerId: uuid("customer_id").notNull(),
    kind: text("kind", { enum: ["spectacles", "contact_lens"] }).notNull().default("spectacles"),
    examinedOn: date("examined_on").notNull(),
    expiresOn: date("expires_on"),
    practitionerMembershipId: uuid("practitioner_membership_id"),
    odSphere: numeric("od_sphere", { precision: 5, scale: 2 }),
    odCylinder: numeric("od_cylinder", { precision: 5, scale: 2 }),
    odAxis: smallint("od_axis"),
    odAdd: numeric("od_add", { precision: 4, scale: 2 }),
    osSphere: numeric("os_sphere", { precision: 5, scale: 2 }),
    osCylinder: numeric("os_cylinder", { precision: 5, scale: 2 }),
    osAxis: smallint("os_axis"),
    osAdd: numeric("os_add", { precision: 4, scale: 2 }),
    pdDistance: numeric("pd_distance", { precision: 4, scale: 1 }),
    notes: text("notes"),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("prescriptions_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.customerId, t.examinedOn),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
    foreignKey({
      columns: [t.businessId, t.practitionerMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
    check("prescriptions_axis_range", sql`(${t.odAxis} is null or ${t.odAxis} between 0 and 180) and (${t.osAxis} is null or ${t.osAxis} between 0 and 180)`),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    businessId: businessId(),
    code: text("code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    source: text("source").notNull().default("website"),
    interest: text("interest"),
    message: text("message"),
    stage: leadStage("stage").notNull().default("new"),
    assignedMembershipId: uuid("assigned_membership_id"),
    preferredBranchId: uuid("preferred_branch_id"),
    followUpAt: ts("follow_up_at"),
    lastContactedAt: ts("last_contacted_at"),
    lostReason: text("lost_reason"),
    estimatedValueCents: money("estimated_value_cents"),
    convertedCustomerId: uuid("converted_customer_id"),
    convertedAt: ts("converted_at"),
    smsConsent: boolean("sms_consent").notNull().default(false),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    externalGhlContactId: text("external_ghl_contact_id"),
    externalGhlOpportunityId: text("external_ghl_opportunity_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    unique().on(t.businessId, t.code),
    unique("leads_business_id_id_key").on(t.businessId, t.id),
    unique("leads_ghl_contact_key").on(t.businessId, t.externalGhlContactId),
    index().on(t.businessId, t.stage),
    index().on(t.businessId, t.assignedMembershipId),
    index().on(t.businessId, t.followUpAt),
    index().on(t.businessId, t.createdAt),
    foreignKey({
      columns: [t.businessId, t.assignedMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
    foreignKey({ columns: [t.businessId, t.preferredBranchId], foreignColumns: [branches.businessId, branches.id] }),
    foreignKey({
      columns: [t.businessId, t.convertedCustomerId],
      foreignColumns: [customers.businessId, customers.id],
    }),
  ],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    businessId: businessId(),
    leadId: uuid("lead_id").notNull(),
    type: text("type").notNull(),
    body: text("body"),
    fromStage: leadStage("from_stage"),
    toStage: leadStage("to_stage"),
    actorMembershipId: uuid("actor_membership_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.leadId, t.createdAt),
    foreignKey({ columns: [t.businessId, t.leadId], foreignColumns: [leads.businessId, leads.id] }),
    foreignKey({
      columns: [t.businessId, t.actorMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

// ─── Scheduling ──────────────────────────────────────────────────────────────

export const appointmentTypes = pgTable(
  "appointment_types",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    requiresPractitioner: boolean("requires_practitioner").notNull().default(true),
    isPublic: boolean("is_public").notNull().default(true),
    priceCents: money("price_cents"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique().on(t.businessId, t.code),
    unique("appointment_types_business_id_id_key").on(t.businessId, t.id),
    check("appointment_types_duration", sql`${t.durationMinutes} between 5 and 480`),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    businessId: businessId(),
    branchId: uuid("branch_id").notNull(),
    appointmentTypeId: uuid("appointment_type_id").notNull(),
    customerId: uuid("customer_id"),
    leadId: uuid("lead_id"),
    practitionerMembershipId: uuid("practitioner_membership_id"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    status: appointmentStatus("status").notNull().default("scheduled"),
    notes: text("notes"),
    source: text("source").notNull().default("dashboard"),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    guestEmail: text("guest_email"),
    cancelReason: text("cancel_reason"),
    externalGhlAppointmentId: text("external_ghl_appointment_id"),
    ghlCalendarId: text("ghl_calendar_id"),
    ghlUpdatedAt: ts("ghl_updated_at"),
    /** local = not linked to GHL; synced = matches GHL; pending/failed = a change still has to reach GHL. */
    syncState: text("sync_state").$type<"local" | "synced" | "pending" | "failed">().notNull().default("local"),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("appointments_business_id_id_key").on(t.businessId, t.id),
    unique("appointments_ghl_key").on(t.businessId, t.externalGhlAppointmentId),
    index().on(t.businessId, t.startsAt),
    index().on(t.businessId, t.practitionerMembershipId, t.startsAt),
    index().on(t.businessId, t.customerId),
    check("appointments_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("appointments_sync_state_check", sql`${t.syncState} in ('local', 'synced', 'pending', 'failed')`),
    foreignKey({ columns: [t.businessId, t.branchId], foreignColumns: [branches.businessId, branches.id] }),
    foreignKey({
      columns: [t.businessId, t.appointmentTypeId],
      foreignColumns: [appointmentTypes.businessId, appointmentTypes.id],
    }),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
    foreignKey({ columns: [t.businessId, t.leadId], foreignColumns: [leads.businessId, leads.id] }),
    foreignKey({
      columns: [t.businessId, t.practitionerMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
    foreignKey({
      columns: [t.businessId, t.createdByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

// ─── Catalogue ───────────────────────────────────────────────────────────────

export const productCategories = pgTable(
  "product_categories",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: categoryKind("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [unique().on(t.businessId, t.slug), unique("product_categories_business_id_id_key").on(t.businessId, t.id)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    businessId: businessId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    paymentTerms: text("payment_terms"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [unique().on(t.businessId, t.code), unique("suppliers_business_id_id_key").on(t.businessId, t.id)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    businessId: businessId(),
    categoryId: uuid("category_id").notNull(),
    supplierId: uuid("supplier_id"),
    name: text("name").notNull(),
    brand: text("brand"),
    description: text("description"),
    imageUrl: text("image_url"),
    productType: productType("product_type").notNull().default("stock"),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    showOnWebsite: boolean("show_on_website").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    unique("products_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.categoryId),
    index("products_name_idx").on(t.businessId, sql`lower(${t.name})`),
    foreignKey({
      columns: [t.businessId, t.categoryId],
      foreignColumns: [productCategories.businessId, productCategories.id],
    }),
    foreignKey({ columns: [t.businessId, t.supplierId], foreignColumns: [suppliers.businessId, suppliers.id] }),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    businessId: businessId(),
    productId: uuid("product_id").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    label: text("label").notNull().default("Default"),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceCents: money("price_cents").notNull(),
    /** Moving weighted-average unit cost, updated on every stock receipt. */
    costCents: money("cost_cents").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(0),
    reorderQty: integer("reorder_qty").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    unique().on(t.businessId, t.sku),
    uniqueIndex("product_variants_barcode_key").on(t.businessId, t.barcode).where(sql`${t.barcode} is not null`),
    unique("product_variants_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.productId),
    check("product_variants_amounts", sql`${t.priceCents} >= 0 and ${t.costCents} >= 0 and ${t.reorderPoint} >= 0 and ${t.reorderQty} >= 0`),
    foreignKey({ columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  ],
);

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: id(),
    businessId: businessId(),
    branchId: uuid("branch_id"),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    unique().on(t.businessId, t.code),
    unique("inventory_locations_business_id_id_key").on(t.businessId, t.id),
    foreignKey({ columns: [t.businessId, t.branchId], foreignColumns: [branches.businessId, branches.id] }),
  ],
);

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    businessId: businessId(),
    variantId: uuid("variant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId] }),
    index().on(t.businessId, t.locationId),
    check("inventory_balances_non_negative", sql`${t.onHand} >= 0 and ${t.reserved} >= 0 and ${t.reserved} <= ${t.onHand}`),
    foreignKey({
      columns: [t.businessId, t.variantId],
      foreignColumns: [productVariants.businessId, productVariants.id],
    }),
    foreignKey({
      columns: [t.businessId, t.locationId],
      foreignColumns: [inventoryLocations.businessId, inventoryLocations.id],
    }),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    businessId: businessId(),
    variantId: uuid("variant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    type: movementType("type").notNull(),
    /** Signed: positive adds to on-hand, negative removes. */
    quantity: integer("quantity").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    unitCostCents: money("unit_cost_cents").notNull().default(0),
    reason: text("reason"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    referenceLineId: uuid("reference_line_id"),
    idempotencyKey: text("idempotency_key"),
    actorMembershipId: uuid("actor_membership_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("stock_movements_idempotency_key").on(t.businessId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index().on(t.businessId, t.variantId, t.createdAt),
    index().on(t.businessId, t.createdAt),
    index().on(t.businessId, t.referenceType, t.referenceId),
    check("stock_movements_quantity_nonzero", sql`${t.quantity} <> 0`),
    foreignKey({
      columns: [t.businessId, t.variantId],
      foreignColumns: [productVariants.businessId, productVariants.id],
    }),
    foreignKey({
      columns: [t.businessId, t.locationId],
      foreignColumns: [inventoryLocations.businessId, inventoryLocations.id],
    }),
    foreignKey({
      columns: [t.businessId, t.actorMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: id(),
    businessId: businessId(),
    variantId: uuid("variant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    saleItemId: uuid("sale_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    releasedAt: ts("released_at"),
    consumedAt: ts("consumed_at"),
  },
  (t) => [
    uniqueIndex("stock_reservations_active_item_key").on(t.saleItemId).where(sql`${t.status} = 'active'`),
    index().on(t.businessId, t.status),
    check("stock_reservations_quantity_positive", sql`${t.quantity} > 0`),
    foreignKey({
      columns: [t.businessId, t.variantId],
      foreignColumns: [productVariants.businessId, productVariants.id],
    }),
    foreignKey({
      columns: [t.businessId, t.locationId],
      foreignColumns: [inventoryLocations.businessId, inventoryLocations.id],
    }),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
    foreignKey({ columns: [t.businessId, t.saleItemId], foreignColumns: [saleItems.businessId, saleItems.id] }),
  ],
);

// ─── Purchasing ──────────────────────────────────────────────────────────────

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    locationId: uuid("location_id").notNull(),
    status: purchaseOrderStatus("status").notNull().default("draft"),
    orderedAt: ts("ordered_at"),
    expectedOn: date("expected_on"),
    notes: text("notes"),
    subtotalCents: money("subtotal_cents").notNull().default(0),
    createdByMembershipId: uuid("created_by_membership_id"),
    approvedByMembershipId: uuid("approved_by_membership_id"),
    receivedAt: ts("received_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.businessId, t.number),
    unique("purchase_orders_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.status),
    foreignKey({ columns: [t.businessId, t.supplierId], foreignColumns: [suppliers.businessId, suppliers.id] }),
    foreignKey({
      columns: [t.businessId, t.locationId],
      foreignColumns: [inventoryLocations.businessId, inventoryLocations.id],
    }),
    foreignKey({
      columns: [t.businessId, t.createdByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
    foreignKey({
      columns: [t.businessId, t.approvedByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: id(),
    businessId: businessId(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    quantityOrdered: integer("quantity_ordered").notNull(),
    quantityReceived: integer("quantity_received").notNull().default(0),
    unitCostCents: money("unit_cost_cents").notNull(),
  },
  (t) => [
    unique().on(t.purchaseOrderId, t.variantId),
    unique("purchase_order_items_business_id_id_key").on(t.businessId, t.id),
    check(
      "purchase_order_items_quantities",
      sql`${t.quantityOrdered} > 0 and ${t.quantityReceived} >= 0 and ${t.quantityReceived} <= ${t.quantityOrdered} and ${t.unitCostCents} >= 0`,
    ),
    foreignKey({
      columns: [t.businessId, t.purchaseOrderId],
      foreignColumns: [purchaseOrders.businessId, purchaseOrders.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.businessId, t.variantId],
      foreignColumns: [productVariants.businessId, productVariants.id],
    }),
  ],
);

export const purchaseOrderReceipts = pgTable(
  "purchase_order_receipts",
  {
    id: id(),
    businessId: businessId(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    receivedByMembershipId: uuid("received_by_membership_id"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("purchase_order_receipts_business_id_id_key").on(t.businessId, t.id),
    uniqueIndex("purchase_order_receipts_idempotency_key")
      .on(t.businessId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    foreignKey({
      columns: [t.businessId, t.purchaseOrderId],
      foreignColumns: [purchaseOrders.businessId, purchaseOrders.id],
    }),
    foreignKey({
      columns: [t.businessId, t.receivedByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

// ─── Sales, orders, payments ─────────────────────────────────────────────────

export const sales = pgTable(
  "sales",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    kind: saleKind("kind").notNull(),
    status: saleStatus("status").notNull(),
    fulfillmentStatus: fulfillmentStatus("fulfillment_status").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    branchId: uuid("branch_id").notNull(),
    locationId: uuid("location_id").notNull(),
    customerId: uuid("customer_id"),
    soldByMembershipId: uuid("sold_by_membership_id"),
    currency: text("currency").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull(),
    pricesIncludeTax: boolean("prices_include_tax").notNull(),
    /** Σ quantity × unit price, before discounts. */
    subtotalCents: money("subtotal_cents").notNull(),
    discountCents: money("discount_cents").notNull().default(0),
    taxCents: money("tax_cents").notNull().default(0),
    totalCents: money("total_cents").notNull(),
    /** Σ unit cost × quantity of tracked/made-to-order lines (COGS snapshot). */
    costCents: money("cost_cents").notNull().default(0),
    paidCents: money("paid_cents").notNull().default(0),
    refundedCents: money("refunded_cents").notNull().default(0),
    refundedCashCents: money("refunded_cash_cents").notNull().default(0),
    balanceDueCents: money("balance_due_cents").notNull(),
    orderDiscountType: text("order_discount_type", { enum: ["percent", "amount"] }),
    orderDiscountValue: bigint("order_discount_value", { mode: "number" }),
    notes: text("notes"),
    dueOn: date("due_on"),
    labSupplierId: uuid("lab_supplier_id"),
    labReference: text("lab_reference"),
    idempotencyKey: text("idempotency_key"),
    /** Fingerprint of the request that created the row; a replay with the same key must match it. */
    requestHash: text("request_hash"),
    /** in_store = POS/orders rung up in the dashboard; ghl_online = imported from a GoHighLevel checkout; website = placed on the customer website. */
    channel: text("channel").$type<"in_store" | "ghl_online" | "website">().notNull().default("in_store"),
    externalGhlOrderId: text("external_ghl_order_id"),
    externalGhlStatus: text("external_ghl_status"),
    createdAt: createdAt(),
    /** Last time the order reached "ready for pickup" — measures turnaround against `dueOn`. */
    readyAt: ts("ready_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.businessId, t.number),
    unique("sales_business_id_id_key").on(t.businessId, t.id),
    uniqueIndex("sales_idempotency_key").on(t.businessId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    uniqueIndex("sales_ghl_order_key").on(t.businessId, t.externalGhlOrderId).where(sql`${t.externalGhlOrderId} is not null`),
    check("sales_channel_check", sql`${t.channel} in ('in_store', 'ghl_online', 'website')`),
    index().on(t.businessId, t.completedAt),
    index().on(t.businessId, t.createdAt),
    index().on(t.businessId, t.customerId),
    index().on(t.businessId, t.kind, t.fulfillmentStatus),
    index().on(t.businessId, t.soldByMembershipId),
    check(
      "sales_amounts",
      sql`${t.subtotalCents} >= 0 and ${t.discountCents} >= 0 and ${t.taxCents} >= 0 and ${t.totalCents} >= 0 and ${t.paidCents} >= 0 and ${t.refundedCents} >= 0 and ${t.refundedCashCents} >= 0 and ${t.refundedCashCents} <= ${t.paidCents} and ${t.refundedCents} <= ${t.totalCents} and ${t.balanceDueCents} >= 0`,
    ),
    foreignKey({ columns: [t.businessId, t.branchId], foreignColumns: [branches.businessId, branches.id] }),
    foreignKey({
      columns: [t.businessId, t.locationId],
      foreignColumns: [inventoryLocations.businessId, inventoryLocations.id],
    }),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
    foreignKey({
      columns: [t.businessId, t.soldByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
    foreignKey({ columns: [t.businessId, t.labSupplierId], foreignColumns: [suppliers.businessId, suppliers.id] }),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    businessId: businessId(),
    saleId: uuid("sale_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    categoryId: uuid("category_id"),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label"),
    sku: text("sku").notNull(),
    productType: productType("product_type").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: money("unit_price_cents").notNull(),
    /** Line discount plus this line's share of any order-level discount. */
    discountCents: money("discount_cents").notNull().default(0),
    taxCents: money("tax_cents").notNull().default(0),
    /** Revenue for the line: after discount, excluding tax. */
    netCents: money("net_cents").notNull(),
    /** What the customer pays for the line (net + tax). */
    lineTotalCents: money("line_total_cents").notNull(),
    unitCostCents: money("unit_cost_cents").notNull().default(0),
    refundedQuantity: integer("refunded_quantity").notNull().default(0),
    prescriptionId: uuid("prescription_id"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique("sale_items_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.saleId),
    index().on(t.businessId, t.variantId),
    check(
      "sale_items_amounts",
      sql`${t.quantity} > 0 and ${t.refundedQuantity} >= 0 and ${t.refundedQuantity} <= ${t.quantity} and ${t.unitPriceCents} >= 0 and ${t.discountCents} >= 0 and ${t.taxCents} >= 0 and ${t.netCents} >= 0`,
    ),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
    foreignKey({
      columns: [t.businessId, t.variantId],
      foreignColumns: [productVariants.businessId, productVariants.id],
    }),
    foreignKey({
      columns: [t.businessId, t.categoryId],
      foreignColumns: [productCategories.businessId, productCategories.id],
    }),
    foreignKey({
      columns: [t.businessId, t.prescriptionId],
      foreignColumns: [prescriptions.businessId, prescriptions.id],
    }),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    businessId: businessId(),
    saleId: uuid("sale_id").notNull(),
    method: paymentMethod("method").notNull(),
    amountCents: money("amount_cents").notNull(),
    tenderedCents: money("tendered_cents"),
    changeCents: money("change_cents"),
    reference: text("reference"),
    status: text("status", { enum: ["completed", "voided"] }).notNull().default("completed"),
    receivedByMembershipId: uuid("received_by_membership_id"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    voidedAt: ts("voided_at"),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payments_business_id_id_key").on(t.businessId, t.id),
    uniqueIndex("payments_idempotency_key").on(t.businessId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    uniqueIndex("payments_reference_key")
      .on(t.businessId, t.method, t.reference)
      .where(sql`${t.reference} is not null and ${t.status} = 'completed'`),
    index().on(t.businessId, t.receivedAt),
    index().on(t.businessId, t.saleId),
    check("payments_amount_positive", sql`${t.amountCents} > 0`),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
    foreignKey({
      columns: [t.businessId, t.receivedByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    saleId: uuid("sale_id").notNull(),
    amountCents: money("amount_cents").notNull(),
    /** Tax portion of the refund amount. */
    taxCents: money("tax_cents").notNull().default(0),
    /** Cost of restocked units, reversed out of COGS. */
    costReversalCents: money("cost_reversal_cents").notNull().default(0),
    method: refundMethod("method").notNull(),
    /**
     * true: a return/credit that reduces the sale's value (and net sales).
     * false: money handed back on an order not yet handed over (deposit return) — value unchanged.
     */
    affectsRevenue: boolean("affects_revenue").notNull().default(true),
    reason: text("reason").notNull(),
    processedByMembershipId: uuid("processed_by_membership_id"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.businessId, t.number),
    unique("refunds_business_id_id_key").on(t.businessId, t.id),
    uniqueIndex("refunds_idempotency_key").on(t.businessId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index().on(t.businessId, t.createdAt),
    // Zero is allowed for returns of free lines (a complimentary case goes back on the shelf); the service
    // only accepts a zero amount when items are returned.
    check("refunds_amounts", sql`${t.amountCents} >= 0 and ${t.taxCents} >= 0 and ${t.costReversalCents} >= 0`),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
    foreignKey({
      columns: [t.businessId, t.processedByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const refundItems = pgTable(
  "refund_items",
  {
    id: id(),
    businessId: businessId(),
    refundId: uuid("refund_id").notNull(),
    saleItemId: uuid("sale_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    amountCents: money("amount_cents").notNull(),
    restock: boolean("restock").notNull(),
  },
  (t) => [
    index().on(t.businessId, t.refundId),
    check("refund_items_amounts", sql`${t.quantity} > 0 and ${t.amountCents} >= 0`),
    foreignKey({ columns: [t.businessId, t.refundId], foreignColumns: [refunds.businessId, refunds.id] }),
    foreignKey({ columns: [t.businessId, t.saleItemId], foreignColumns: [saleItems.businessId, saleItems.id] }),
  ],
);

// ─── Finance ─────────────────────────────────────────────────────────────────

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique().on(t.businessId, t.name), unique("expense_categories_business_id_id_key").on(t.businessId, t.id)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    businessId: businessId(),
    branchId: uuid("branch_id"),
    categoryId: uuid("category_id").notNull(),
    amountCents: money("amount_cents").notNull(),
    expenseDate: date("expense_date").notNull(),
    paymentMethod: text("payment_method"),
    payee: text("payee"),
    description: text("description").notNull(),
    reference: text("reference"),
    attachmentPath: text("attachment_path"),
    attachmentName: text("attachment_name"),
    status: text("status", { enum: ["recorded", "voided"] }).notNull().default("recorded"),
    voidedAt: ts("voided_at"),
    voidReason: text("void_reason"),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("expenses_business_id_id_key").on(t.businessId, t.id),
    index().on(t.businessId, t.expenseDate),
    check("expenses_amount_positive", sql`${t.amountCents} > 0`),
    foreignKey({ columns: [t.businessId, t.branchId], foreignColumns: [branches.businessId, branches.id] }),
    foreignKey({
      columns: [t.businessId, t.categoryId],
      foreignColumns: [expenseCategories.businessId, expenseCategories.id],
    }),
    foreignKey({
      columns: [t.businessId, t.createdByMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

// ─── Audit & integrations ────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    businessId: businessId(),
    actorMembershipId: uuid("actor_membership_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.createdAt),
    index().on(t.businessId, t.entityType, t.entityId),
    foreignKey({
      columns: [t.businessId, t.actorMembershipId],
      foreignColumns: [businessMemberships.businessId, businessMemberships.id],
    }),
  ],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    businessId: businessId(),
    provider: text("provider").notNull(),
    status: text("status").$type<IntegrationStatus>().notNull().default("not_configured"),
    /** "oauth" (marketplace app, preferred) or "private_token" (single sub-account Private Integration). */
    authType: text("auth_type").$type<"oauth" | "private_token">(),
    externalAccountId: text("external_account_id"),
    accountName: text("account_name"),
    accountTimezone: text("account_timezone"),
    companyId: text("company_id"),
    /** Private Integration token (private_token auth), AES-256-GCM encrypted. */
    credentialsEncrypted: text("credentials_encrypted"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: ts("token_expires_at"),
    scopes: text("scopes"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    connectedByMembershipId: uuid("connected_by_membership_id"),
    connectedAt: ts("connected_at"),
    lastTestedAt: ts("last_tested_at"),
    lastSyncAt: ts("last_sync_at"),
    lastSuccessAt: ts("last_success_at"),
    rateLimitedUntil: ts("rate_limited_until"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.businessId, t.provider),
    // One external account (GHL location) can belong to only one business.
    uniqueIndex("integration_connections_external_account_key")
      .on(t.provider, t.externalAccountId)
      .where(sql`${t.externalAccountId} is not null and ${t.status} <> 'disabled'`),
    check("integration_connections_status_check", sql`${t.status} in (${inList(INTEGRATION_STATUSES)})`),
    check("integration_connections_auth_type_check", sql`${t.authType} is null or ${t.authType} in ('oauth', 'private_token')`),
  ],
);

export const integrationSyncEvents = pgTable(
  "integration_sync_events",
  {
    id: id(),
    businessId: businessId(),
    provider: text("provider").notNull(),
    direction: syncDirection("direction").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    externalId: text("external_id"),
    idempotencyKey: text("idempotency_key"),
    category: text("category").$type<SyncCategory>().notNull().default("system"),
    status: text("status").$type<SyncStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastHttpStatus: integer("last_http_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** What the handler concluded (external ids, counts) — shown in the sync log. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    createdAt: createdAt(),
    processedAt: ts("processed_at"),
    reviewedAt: ts("reviewed_at"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id"),
  },
  (t) => [
    uniqueIndex("integration_sync_events_idempotency_key")
      .on(t.businessId, t.provider, t.direction, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index().on(t.businessId, t.status, t.nextAttemptAt),
    index("integration_sync_events_due").on(t.status, t.nextAttemptAt),
    index().on(t.businessId, t.category, t.createdAt),
    check("integration_sync_events_status_check", sql`${t.status} in (${inList(SYNC_STATUSES)})`),
    check("integration_sync_events_category_check", sql`${t.category} in (${inList(SYNC_CATEGORIES)})`),
  ],
);

/** Single-use OAuth `state` values, bound to the business and staff member who started the connection. */
export const oauthStates = pgTable(
  "oauth_states",
  {
    id: text("id").primaryKey(), // SHA-256 of the state value; the raw value only travels in the redirect
    businessId: businessId(),
    membershipId: uuid("membership_id").notNull(),
    provider: text("provider").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.businessId, t.membershipId], foreignColumns: [businessMemberships.businessId, businessMemberships.id] }).onDelete("cascade"),
  ],
);

/** Local mirror of GHL contacts with links to the lead/customer they belong to. Keyed by the stable GHL id. */
export const ghlContacts = pgTable(
  "ghl_contacts",
  {
    id: id(),
    businessId: businessId(),
    ghlContactId: text("ghl_contact_id").notNull(),
    leadId: uuid("lead_id"),
    customerId: uuid("customer_id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    source: text("source"),
    ghlUpdatedAt: ts("ghl_updated_at"),
    lastSyncedAt: ts("last_synced_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ghl_contacts_business_contact_key").on(t.businessId, t.ghlContactId),
    index().on(t.businessId, t.leadId),
    index().on(t.businessId, t.customerId),
    foreignKey({ columns: [t.businessId, t.leadId], foreignColumns: [leads.businessId, leads.id] }),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
  ],
);

export const ghlPipelines = pgTable(
  "ghl_pipelines",
  {
    id: id(),
    businessId: businessId(),
    ghlPipelineId: text("ghl_pipeline_id").notNull(),
    name: text("name").notNull(),
    stages: jsonb("stages").$type<{ id: string; name: string; position: number }[]>().notNull().default([]),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [unique("ghl_pipelines_business_pipeline_key").on(t.businessId, t.ghlPipelineId)],
);

/** Mirror of GHL opportunities. Pipeline value is CRM data — never revenue. */
export const ghlOpportunities = pgTable(
  "ghl_opportunities",
  {
    id: id(),
    businessId: businessId(),
    ghlOpportunityId: text("ghl_opportunity_id").notNull(),
    ghlContactId: text("ghl_contact_id"),
    leadId: uuid("lead_id"),
    customerId: uuid("customer_id"),
    /** The dashboard sale/order this opportunity represents, when it was created from one. */
    saleId: uuid("sale_id"),
    /** The dashboard lead whose lead-pipeline opportunity this is (one per lead; created by the dashboard). */
    ownerLeadId: uuid("owner_lead_id"),
    name: text("name").notNull(),
    pipelineId: text("pipeline_id"),
    pipelineStageId: text("pipeline_stage_id"),
    status: text("status").notNull().default("open"),
    monetaryValueCents: money("monetary_value_cents").notNull().default(0),
    assignedTo: text("assigned_to"),
    source: text("source"),
    ghlCreatedAt: ts("ghl_created_at"),
    ghlUpdatedAt: ts("ghl_updated_at"),
    lastSyncedAt: ts("last_synced_at"),
    /** What the dashboard last wrote (for sale opportunities) — lets a sync tell GHL-side edits from stale local data. */
    lastPushed: jsonb("last_pushed").$type<{ status: string; stageId: string | null; valueCents: number; name: string }>(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ghl_opportunities_business_opportunity_key").on(t.businessId, t.ghlOpportunityId),
    uniqueIndex("ghl_opportunities_sale_key").on(t.businessId, t.saleId).where(sql`${t.saleId} is not null`),
    uniqueIndex("ghl_opportunities_owner_lead_key").on(t.businessId, t.ownerLeadId).where(sql`${t.ownerLeadId} is not null`),
    index().on(t.businessId, t.status),
    index().on(t.businessId, t.pipelineId, t.pipelineStageId),
    check("ghl_opportunities_status_check", sql`${t.status} in ('open', 'won', 'lost', 'abandoned')`),
    foreignKey({ columns: [t.businessId, t.leadId], foreignColumns: [leads.businessId, leads.id] }),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  ],
);

/** GHL calendars and which branch + appointment type each one represents locally. */
export const ghlCalendars = pgTable(
  "ghl_calendars",
  {
    id: id(),
    businessId: businessId(),
    ghlCalendarId: text("ghl_calendar_id").notNull(),
    name: text("name").notNull(),
    branchId: uuid("branch_id"),
    appointmentTypeId: uuid("appointment_type_id"),
    /** Personal calendars: the staff member it books (used when GHL sends no assigned user). */
    practitionerMembershipId: uuid("practitioner_membership_id"),
    isActive: boolean("is_active").notNull().default(true),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    unique("ghl_calendars_business_calendar_key").on(t.businessId, t.ghlCalendarId),
    foreignKey({ columns: [t.businessId, t.branchId], foreignColumns: [branches.businessId, branches.id] }),
    foreignKey({ columns: [t.businessId, t.appointmentTypeId], foreignColumns: [appointmentTypes.businessId, appointmentTypes.id] }),
  ],
);

/** GHL users <-> staff members (for appointment assignment and opportunity owners). */
export const ghlUsers = pgTable(
  "ghl_users",
  {
    id: id(),
    businessId: businessId(),
    ghlUserId: text("ghl_user_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    membershipId: uuid("membership_id"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    unique("ghl_users_business_user_key").on(t.businessId, t.ghlUserId),
    uniqueIndex("ghl_users_membership_key").on(t.businessId, t.membershipId).where(sql`${t.membershipId} is not null`),
    foreignKey({ columns: [t.businessId, t.membershipId], foreignColumns: [businessMemberships.businessId, businessMemberships.id] }),
  ],
);

/** Dashboard variant <-> GHL product + price. The dashboard is the source of truth for both. */
export const ghlProductLinks = pgTable(
  "ghl_product_links",
  {
    id: id(),
    businessId: businessId(),
    productId: uuid("product_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    ghlProductId: text("ghl_product_id"),
    ghlPriceId: text("ghl_price_id"),
    /** Hash of the product/price fields last confirmed by GHL, to skip no-op updates. */
    lastPushedHash: text("last_pushed_hash"),
    lastPushedQuantity: integer("last_pushed_quantity"),
    lastSyncedAt: ts("last_synced_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ghl_product_links_variant_key").on(t.businessId, t.variantId),
    uniqueIndex("ghl_product_links_price_key").on(t.businessId, t.ghlPriceId).where(sql`${t.ghlPriceId} is not null`),
    index().on(t.businessId, t.ghlProductId),
    foreignKey({ columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.variantId], foreignColumns: [productVariants.businessId, productVariants.id] }).onDelete("cascade"),
  ],
);

/**
 * Reconciliation findings (stock that differs from GHL, orders missing locally, duplicates, stale
 * records). One open row per finding; resolving never changes local stock silently.
 */
export const integrationMismatches = pgTable(
  "integration_mismatches",
  {
    id: id(),
    businessId: businessId(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    externalId: text("external_id"),
    message: text("message").notNull(),
    localValue: jsonb("local_value").$type<unknown>(),
    externalValue: jsonb("external_value").$type<unknown>(),
    status: text("status").notNull().default("open"),
    detectedAt: ts("detected_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
    resolvedByMembershipId: uuid("resolved_by_membership_id"),
    resolution: text("resolution"),
  },
  (t) => [
    uniqueIndex("integration_mismatches_open_key").on(t.businessId, t.provider, t.kind, t.dedupeKey).where(sql`${t.status} = 'open'`),
    index().on(t.businessId, t.status, t.detectedAt),
    check("integration_mismatches_status_check", sql`${t.status} in ('open', 'resolved', 'ignored')`),
  ],
);


// ─── Public website API ──────────────────────────────────────────────────────

export const API_KEY_SCOPES = ["site:read", "catalog:read", "inquiries:write", "orders:read", "orders:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * Server-to-server keys for the customer website (docs/PUBLIC_API.md). Only a SHA-256 hash is
 * stored; the key itself is shown once when created. The key decides the business (tenant).
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    /** First characters of the key, shown in lists so a key can be recognised without revealing it. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<ApiKeyScope[]>().notNull(),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("api_keys_hash_key").on(t.keyHash), index().on(t.businessId)],
);

/** Fixed-window request counters shared by every server instance (public API rate limits). */
export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] }), index().on(t.windowStart)],
);

/**
 * How the customer will supply the prescription for one pair of prescription glasses. Values typed on
 * the website are the customer's own transcription: kept here, flagged unverified, and never written
 * into the clinical `prescriptions` table automatically.
 */
export type WebsitePrescription = {
  /** Frame line the lenses belong to, as shown on the order (product · variant). */
  frame: string;
  lens: string;
  mode: "enter" | "send_later" | "on_file" | "book_exam";
  values?: {
    od: { sph: string; cyl: string | null; axis: string | null; add: string | null };
    os: { sph: string; cyl: string | null; axis: string | null; add: string | null };
    pd: string | null;
    issuedOn: string | null;
  };
};

/**
 * Orders placed on the customer website (one per `sales` row with channel 'website'): the customer's
 * order-status token (hash only), the details as they entered them, and the demo payment choice.
 */
export const websiteOrders = pgTable(
  "website_orders",
  {
    id: id(),
    businessId: businessId(),
    saleId: uuid("sale_id").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    paymentOption: text("payment_option", { enum: ["pay_at_pickup", "demo_card"] }).notNull(),
    prescriptions: jsonb("prescriptions").$type<WebsitePrescription[]>().notNull().default([]),
    /** The customer confirmed they hold a current contact lens prescription (contact lens lines only). */
    contactLensRxConfirmed: boolean("contact_lens_rx_confirmed").notNull().default(false),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    smsConsent: boolean("sms_consent").notNull().default(false),
    customerNote: text("customer_note"),
    clientIp: text("client_ip"),
    createdAt: createdAt(),
    cancelledByCustomerAt: ts("cancelled_by_customer_at"),
  },
  (t) => [
    unique("website_orders_sale_key").on(t.businessId, t.saleId),
    index().on(t.businessId, t.createdAt),
    foreignKey({ columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  ],
);

// ─── POS held carts ──────────────────────────────────────────────────────────

/** A cart saved at the counter. Stored as entered, re-priced and re-checked when resumed. */
export type HeldCartContent = {
  lines: { variantId: string; qty: number; customPriceCents: number | null; discount?: { type: "amount"; cents: number } | { type: "percent"; bps: number } | null }[];
  discount: { type: "none" | "percent" | "amount"; value: string };
  notes: string;
};
export const HELD_CART_STATUSES = ["held", "resumed", "cancelled"] as const;

/**
 * Suspended POS sales. They deliberately do NOT reserve stock: availability is checked again when the
 * cart is resumed and, authoritatively, at checkout. Held carts expire (expires_at) so none linger.
 */
export const posHeldCarts = pgTable(
  "pos_held_carts",
  {
    id: id(),
    businessId: businessId(),
    branchId: uuid("branch_id").notNull(),
    label: text("label").notNull(),
    customerId: uuid("customer_id"),
    cart: jsonb("cart").$type<HeldCartContent>().notNull(),
    itemCount: integer("item_count").notNull(),
    /** Estimate at the time it was held, for the list only; checkout always re-prices. */
    estimatedTotalCents: money("estimated_total_cents").notNull(),
    status: text("status", { enum: HELD_CART_STATUSES }).notNull().default("held"),
    heldByMembershipId: uuid("held_by_membership_id"),
    closedByMembershipId: uuid("closed_by_membership_id"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    foreignKey({ columns: [t.branchId], foreignColumns: [branches.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.customerId], foreignColumns: [customers.id] }).onDelete("set null"),
    index().on(t.businessId, t.branchId, t.status),
    check("pos_held_carts_items", sql`${t.itemCount} between 1 and 200`),
  ],
);
