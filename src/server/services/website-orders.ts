import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatMoney } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { websiteOrderInput, websiteQuoteInput, type WebsiteRxInput } from "@/lib/schemas";
import type { Permission } from "@/lib/permissions";
import { getDb, type Tx } from "@/server/db";
import {
  auditLogs,
  branches,
  businesses,
  customers,
  inventoryBalances,
  inventoryLocations,
  payments,
  productCategories,
  products,
  productVariants,
  saleItems,
  sales,
  websiteOrders,
  type WebsitePrescription,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { onCustomerChanged } from "@/server/integrations/ghl/triggers";
import { AppError, audit, conflict, invalid, nextNumber, now, systemCtx, type Ctx } from "./core";
import { locationForBranch } from "./inventory";
import { PublicApiError } from "./public-api";
import { activeBranch, businessTax, buildLines, idempotent, insertItems, price, settle, transitionInTx } from "./sales";

/*
 * Orders placed on the customer website (docs/PUBLIC_API.md → "Website orders").
 *
 * They are ordinary customer orders (`sales.kind = 'order'`, channel 'website'), so staff fulfil them
 * in Orders like any other: stock is reserved the moment the order is placed (stage Confirmed),
 * consumed at handover, and the GoHighLevel sale opportunity follows the order.
 *
 * This is a demonstration store. Online payment is the website's simulated card step: the dashboard
 * records it as method `online_demo` ("not charged") and no money moves. "Pay at pickup" leaves the
 * balance due for the branch to collect.
 */

const PERMS: Permission[] = ["orders.manage", "orders.view", "customers.view", "customers.manage", "pos.use", "payments.record"];
const websiteCtx = (businessId: string, ip: string | null = null): Ctx => ({ ...systemCtx(businessId, "Website", PERMS), ip });

// ─── Order access tokens ─────────────────────────────────────────────────────

/** The customer's order-status secret: deterministic per order (so a retried checkout gets the same link), never stored. */
function orderToken(saleId: string) {
  return createHmac("sha256", env().APP_SECRET).update(`website-order:${saleId}`).digest("base64url").slice(0, 32);
}
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function tokenMatches(given: string | null | undefined, storedHash: string) {
  if (!given || given.length > 100) return false;
  const a = Buffer.from(hashToken(given), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function orderingEnabled(businessId: string) {
  const [biz] = await getDb().select({ settings: businesses.settings, isDemo: businesses.isDemo }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return false;
  return biz.settings?.websiteOrders?.enabled ?? biz.isDemo;
}

// ─── Lenses ──────────────────────────────────────────────────────────────────

export type LensType = "single_vision" | "progressive" | "bifocal";

/** Lens type and features from the product's attributes, falling back to its name. */
export function lensProfile(name: string, attributes: Record<string, string> = {}): { type: LensType; features: string[] } {
  const n = `${name} ${attributes.lensType ?? ""}`.toLowerCase();
  const type: LensType = /progressive|multifocal/.test(n) ? "progressive" : /bifocal/.test(n) ? "bifocal" : "single_vision";
  const features: string[] = [];
  if (/blue/.test(n)) features.push("blue_light");
  if (/1\.6[0-9]|1\.7[0-9]|thin/.test(n)) features.push("thin");
  if (/photochrom|transition/.test(n)) features.push("photochromic");
  return { type, features };
}

/** Published prescription-lens products (made to order) the website can fit to a frame. */
export async function publicLenses(businessId: string) {
  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      productId: products.id,
      name: products.name,
      description: products.description,
      attributes: products.attributes,
      priceCents: productVariants.priceCents,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(
      and(
        eq(products.businessId, businessId),
        eq(productCategories.kind, "rx_lenses"),
        eq(products.productType, "made_to_order"),
        eq(products.showOnWebsite, true),
        eq(products.isActive, true),
        isNull(products.archivedAt),
        eq(productVariants.isActive, true),
        isNull(productVariants.archivedAt),
      ),
    )
    .orderBy(asc(productVariants.priceCents), asc(products.name));
  return {
    lenses: rows.map((r) => ({ variantId: r.variantId, productId: r.productId, name: r.name, description: r.description, priceCents: Number(r.priceCents), ...lensProfile(r.name, r.attributes ?? {}) })),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Cart lines ──────────────────────────────────────────────────────────────

type CatalogueVariant = {
  id: string;
  label: string;
  options: Record<string, string>;
  priceCents: number;
  productId: string;
  productName: string;
  productType: "stock" | "service" | "made_to_order";
  categoryKind: string;
};

/** Loads the variants a cart refers to, keeping only what the website may sell. */
async function sellableVariants(ex: Tx | ReturnType<typeof getDb>, businessId: string, ids: string[]) {
  const rows = await ex
    .select({
      id: productVariants.id,
      label: productVariants.label,
      options: productVariants.options,
      priceCents: productVariants.priceCents,
      productId: products.id,
      productName: products.name,
      productType: products.productType,
      categoryKind: productCategories.kind,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(
      and(
        eq(productVariants.businessId, businessId),
        inArray(productVariants.id, ids),
        eq(productVariants.isActive, true),
        isNull(productVariants.archivedAt),
        eq(products.showOnWebsite, true),
        eq(products.isActive, true),
        isNull(products.archivedAt),
        eq(productCategories.isActive, true),
      ),
    );
  return new Map(rows.map((r) => [r.id, { ...r, priceCents: Number(r.priceCents), options: r.options ?? {} } as CatalogueVariant]));
}

/** Validates the cart's structure: published items, lenses only on frames, nothing sold that the site can't sell. */
function checkCart(items: { variantId: string; lensVariantId?: string | null }[], byId: Map<string, CatalogueVariant>) {
  const problems: string[] = [];
  for (const item of items) {
    const v = byId.get(item.variantId);
    if (!v) {
      problems.push("An item in your bag is no longer available online.");
      continue;
    }
    if (v.productType === "service" || v.categoryKind === "services" || v.categoryKind === "rx_lenses") problems.push(`${v.productName} can't be ordered on its own online.`);
    if (item.lensVariantId) {
      const lens = byId.get(item.lensVariantId);
      if (!lens || lens.categoryKind !== "rx_lenses" || lens.productType !== "made_to_order") problems.push(`The lenses chosen for ${v.productName} are no longer available.`);
      else if (v.categoryKind !== "frames") problems.push(`Prescription lenses can only be added to frames, not ${v.productName}.`);
    }
  }
  if (problems.length) throw invalid([...new Set(problems)].join(" "));
}

/** One cart line → the sale lines it becomes: the item, then its lenses (same quantity). */
function saleLinesFor(items: { variantId: string; quantity: number; lensVariantId?: string | null; prescription?: WebsiteRxInput | null }[], byId: Map<string, CatalogueVariant>) {
  const lines: { variantId: string; quantity: number; lineDiscountCents: number; prescriptionId: null; notes: string | null }[] = [];
  for (const item of items) {
    lines.push({ variantId: item.variantId, quantity: item.quantity, lineDiscountCents: 0, prescriptionId: null, notes: null });
    if (item.lensVariantId) {
      const frame = byId.get(item.variantId)!;
      lines.push({ variantId: item.lensVariantId, quantity: item.quantity, lineDiscountCents: 0, prescriptionId: null, notes: `For ${frame.productName} · ${frame.label}. Prescription: ${rxModeLabel(item.prescription?.mode)}.` });
    }
  }
  return lines;
}

const RX_MODE_LABELS: Record<WebsitePrescription["mode"], string> = {
  enter: "entered online by the customer (unverified — check before ordering lenses)",
  send_later: "customer will send it",
  on_file: "use the latest one on file at the branch",
  book_exam: "customer will book an eye exam",
};
const rxModeLabel = (mode: WebsitePrescription["mode"] | undefined) => (mode ? RX_MODE_LABELS[mode] : "not given");

/** Units available (on hand − reserved) per variant at each active branch. */
async function availabilityByBranch(ex: Tx | ReturnType<typeof getDb>, businessId: string, variantIds: string[]) {
  const [branchRows, stock] = await Promise.all([
    ex
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(and(eq(branches.businessId, businessId), eq(branches.isActive, true)))
      .orderBy(asc(branches.sortOrder), asc(branches.name)),
    variantIds.length
      ? ex
          .select({ variantId: inventoryBalances.variantId, branchId: inventoryLocations.branchId, available: sql<number>`sum(greatest(${inventoryBalances.onHand} - ${inventoryBalances.reserved}, 0))::int` })
          .from(inventoryBalances)
          .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryBalances.locationId))
          .where(and(eq(inventoryBalances.businessId, businessId), inArray(inventoryBalances.variantId, variantIds), eq(inventoryLocations.isActive, true)))
          .groupBy(inventoryBalances.variantId, inventoryLocations.branchId)
      : Promise.resolve([]),
  ]);
  const at = new Map(stock.map((s) => [`${s.variantId}:${s.branchId}`, Number(s.available)]));
  return { branches: branchRows, available: (variantId: string, branchId: string) => at.get(`${variantId}:${branchId}`) ?? 0 };
}

// ─── Quote ───────────────────────────────────────────────────────────────────

/**
 * Prices a website bag exactly as an order would be priced, and says which branches can fulfil it
 * from stock. Never returns quantities: only whether each branch has enough.
 */
export async function quoteWebsiteCart(businessId: string, raw: unknown) {
  const input = websiteQuoteInput.parse(raw);
  const ids = [...new Set(input.items.flatMap((i) => [i.variantId, ...(i.lensVariantId ? [i.lensVariantId] : [])]))];
  const db = getDb();
  const byId = await sellableVariants(db, businessId, ids);
  checkCart(input.items, byId);
  const ctx = websiteCtx(businessId);
  return db.transaction(
    async (tx) => {
      const tax = await businessTax(tx, ctx);
      const { pricing, meta } = await buildLines(tx, ctx, saleLinesFor(input.items, byId), null);
      const priced = price(pricing, tax, null);
      const needs = new Map<string, number>();
      for (const item of input.items) if (byId.get(item.variantId)!.productType === "stock") needs.set(item.variantId, (needs.get(item.variantId) ?? 0) + item.quantity);
      const stock = await availabilityByBranch(tx, businessId, [...needs.keys()]);
      return {
        currency: tax.currency,
        pricesIncludeTax: tax.pricesIncludeTax,
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        lines: meta.map((m, i) => ({ variantId: m.variantId, name: m.productName, variantLabel: m.variantLabel, productType: m.productType, quantity: priced.lines[i].quantity, unitPriceCents: priced.lines[i].unitPriceCents, lineTotalCents: priced.lines[i].lineTotalCents })),
        branches: stock.branches.map((b) => {
          const short = [...needs.entries()].filter(([v, qty]) => stock.available(v, b.id) < qty).map(([v]) => v);
          return { branchId: b.id, name: b.name, code: b.code, canFulfil: short.length === 0, unavailableVariantIds: short };
        }),
        generatedAt: new Date().toISOString(),
      };
    },
    { accessMode: "read only" },
  );
}

// ─── Place an order ──────────────────────────────────────────────────────────

/** Ready-by estimate: lenses are made at the lab (about a week); stocked items need a day or two. */
function estimateDueOn(timezone: string, hasLenses: boolean) {
  const days = hasLenses ? 7 : 2;
  return todayIn(timezone, new Date(Date.now() + days * 86_400_000));
}

export async function placeWebsiteOrder(businessId: string, raw: unknown, meta: { ip?: string | null } = {}) {
  const input = websiteOrderInput.parse(raw);
  if (input.website) throw new PublicApiError(400, "We couldn't place this order. Please try again.");
  if (!(await orderingEnabled(businessId))) throw new PublicApiError(403, "Online ordering is switched off. Please visit a branch or contact us.");
  const ctx = websiteCtx(businessId, meta.ip ?? null);
  const key = `web:${input.idempotencyKey}`;
  const { website: _honeypot, ...hashed } = input;
  void _honeypot;
  const fingerprint = createHash("sha256").update(JSON.stringify(hashed)).digest("hex");

  const lookup = async () => {
    const [s] = await getDb()
      .select({ saleId: sales.id, number: sales.number, requestHash: sales.requestHash })
      .from(sales)
      .where(and(eq(sales.businessId, businessId), eq(sales.idempotencyKey, key)))
      .limit(1);
    return s ?? null;
  };

  const result = await idempotent(
    lookup,
    async (tx, recheck) => {
      const ids = [...new Set(input.items.flatMap((i) => [i.variantId, ...(i.lensVariantId ? [i.lensVariantId] : [])]))];
      const byId = await sellableVariants(tx, businessId, ids);
      checkCart(input.items, byId);
      const hasLenses = input.items.some((i) => i.lensVariantId);
      const needsContactRx = input.items.some((i) => byId.get(i.variantId)?.categoryKind === "contact_lenses");
      if (needsContactRx && !input.contactLensRxConfirmed) throw invalid("Confirm that you have a current contact lens prescription.", { contactLensRxConfirmed: ["Required for contact lenses."] });
      for (const i of input.items) {
        if (i.lensVariantId && !i.prescription) throw invalid("Tell us how you'll provide the prescription for each pair of prescription glasses.");
      }

      const tax = await businessTax(tx, ctx);
      const [biz] = await tx.select({ timezone: businesses.timezone, locale: businesses.locale }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const branch = await activeBranch(tx, ctx, input.branchId);
      const location = await locationForBranch(tx, ctx, branch.id);
      const { pricing, meta: lines } = await buildLines(tx, ctx, saleLinesFor(input.items, byId), null);
      const priced = price(pricing, tax, null);
      if (priced.totalCents !== input.expectedTotalCents) {
        throw conflict(`Prices changed while you were checking out: the total is now ${formatMoney(priced.totalCents, tax.currency, biz.locale)}. Review your bag and place the order again.`);
      }
      await recheck();

      const customer = await findOrCreateCustomer(tx, ctx, input, branch.id);
      const saleId: string = randomUUID();
      const number = await nextNumber(tx, businessId, "order", "ORD-");
      const at = now(ctx);
      const cost = lines.reduce((s, m, i) => s + m.unitCostCents * priced.lines[i].quantity, 0);
      const paymentNote = input.payment.option === "demo_card" ? `Paid online with the demo card ending ${input.payment.cardLast4} (simulated — nothing was charged)` : "Pay at pickup";
      await tx.insert(sales).values({
        id: saleId,
        businessId,
        number,
        kind: "order",
        status: "open",
        fulfillmentStatus: "new",
        paymentStatus: "unpaid",
        branchId: branch.id,
        locationId: location.id,
        customerId: customer.id,
        soldByMembershipId: null,
        currency: tax.currency,
        taxRateBps: tax.taxRateBps,
        pricesIncludeTax: tax.pricesIncludeTax,
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        costCents: cost,
        balanceDueCents: priced.totalCents,
        notes: [`Website order · pickup at ${branch.name} · ${paymentNote}.`, input.note ? `Customer note: ${input.note}` : null].filter(Boolean).join("\n"),
        dueOn: estimateDueOn(biz.timezone, hasLenses),
        idempotencyKey: key,
        requestHash: fingerprint,
        channel: "website",
        createdAt: at,
        updatedAt: at,
      });
      await insertItems(tx, ctx, saleId, lines, priced);

      let paid = 0;
      if (input.payment.option === "demo_card") {
        await tx.insert(payments).values({
          businessId,
          saleId,
          method: "online_demo",
          amountCents: priced.totalCents,
          reference: input.payment.reference,
          receivedAt: at,
          notes: `Demo store: simulated ${input.payment.cardBrand || "card"} payment, card ending ${input.payment.cardLast4}. No money was charged.`,
          idempotencyKey: `${key}:pay`,
          createdAt: at,
        });
        paid = priced.totalCents;
      }
      await settle(tx, ctx, { id: saleId, totalCents: priced.totalCents, paidCents: paid, refundedCents: 0, refundedCashCents: 0, status: "open" });

      const prescriptions: WebsitePrescription[] = input.items
        .filter((i) => i.lensVariantId && i.prescription)
        .map((i) => {
          const frame = byId.get(i.variantId)!;
          const lens = byId.get(i.lensVariantId!)!;
          const rx = i.prescription!;
          return {
            frame: `${frame.productName} · ${frame.label}`,
            lens: lens.productName,
            mode: rx.mode,
            ...(rx.mode === "enter" ? { values: { od: rx.od, os: rx.os, pd: rx.pd, issuedOn: rx.issuedOn } } : {}),
          };
        });
      await tx.insert(websiteOrders).values({
        businessId,
        saleId,
        accessTokenHash: hashToken(orderToken(saleId)),
        contactName: input.customer.fullName,
        contactEmail: input.customer.email,
        contactPhone: input.customer.phone ?? null,
        paymentOption: input.payment.option,
        prescriptions,
        contactLensRxConfirmed: input.contactLensRxConfirmed,
        marketingConsent: input.marketingConsent,
        smsConsent: input.smsConsent,
        customerNote: input.note ?? null,
        clientIp: meta.ip ?? null,
        createdAt: at,
      });
      await audit(tx, ctx, {
        action: "order.created",
        entityType: "sale",
        entityId: saleId,
        summary: `Website order ${number} · ${formatMoney(priced.totalCents, tax.currency, biz.locale)} · pickup at ${branch.name} · ${input.payment.option === "demo_card" ? "paid with the demo card (not charged)" : "pay at pickup"}`,
      });
      // Reserve every stocked unit now, so it can't be sold at the counter before pickup. Throws (and
      // rolls the whole order back) if the branch no longer has enough. It also queues the GHL sync.
      await transitionInTx(tx, ctx, saleId, "confirmed", null);
      return { saleId, number };
    },
    "sales_idempotency_key",
    fingerprint,
  ).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "conflict" && /Not enough stock/.test(error.message)) {
      throw new PublicApiError(409, "Some items just sold out at this branch. Choose another branch or remove them from your bag.");
    }
    if (error instanceof AppError && error.code === "conflict") throw new PublicApiError(409, error.message);
    throw error;
  });

  const order = await getWebsiteOrderById(businessId, result.saleId);
  return { ...order, token: orderToken(result.saleId), replayed: result.replayed };
}

/**
 * The customer record for a website order. A returning customer is matched by email, then phone,
 * and is never modified by anonymous input (name, contact details and consent stay as staff recorded
 * them). Otherwise a new customer is created with the consent the customer gave.
 */
async function findOrCreateCustomer(tx: Tx, ctx: Ctx, input: ReturnType<typeof websiteOrderInput.parse>, branchId: string) {
  const email = input.customer.email;
  const digits = (input.customer.phone ?? "").replace(/\D/g, "");
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, ctx.businessId),
        isNull(customers.archivedAt),
        sql`(lower(${customers.email}) = ${email}${digits ? sql` or regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g') = ${digits}` : sql``})`,
      ),
    )
    .orderBy(sql`case when lower(${customers.email}) = ${email} then 0 else 1 end`, asc(customers.createdAt))
    .limit(1);
  if (existing) return existing;
  const [first, ...rest] = input.customer.fullName.trim().split(/\s+/);
  const code = await nextNumber(tx, ctx.businessId, "customer", "CUS-", 5);
  const at = now(ctx);
  const [row] = await tx
    .insert(customers)
    .values({
      businessId: ctx.businessId,
      code,
      firstName: first,
      lastName: rest.join(" ") || "—",
      email,
      phone: input.customer.phone ?? null,
      source: "website",
      marketingConsent: input.marketingConsent,
      smsConsent: input.smsConsent,
      homeBranchId: branchId,
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: customers.id, code: customers.code });
  await audit(tx, ctx, { action: "customer.created", entityType: "customer", entityId: row.id, summary: `Added customer ${input.customer.fullName} (${row.code}) from a website order` });
  await onCustomerChanged(tx, ctx.businessId, row.id);
  return row;
}

// ─── Order status (customer view) ────────────────────────────────────────────

async function getWebsiteOrderById(businessId: string, saleId: string) {
  const db = getDb();
  const [row] = await db
    .select({ sale: sales, web: websiteOrders, branch: branches })
    .from(sales)
    .innerJoin(websiteOrders, and(eq(websiteOrders.businessId, sales.businessId), eq(websiteOrders.saleId, sales.id)))
    .innerJoin(branches, eq(branches.id, sales.branchId))
    .where(and(eq(sales.businessId, businessId), eq(sales.id, saleId)))
    .limit(1);
  if (!row) throw new PublicApiError(404, "Not found");
  const [items, history, biz] = await Promise.all([
    db.select().from(saleItems).where(and(eq(saleItems.businessId, businessId), eq(saleItems.saleId, saleId))).orderBy(asc(saleItems.sortOrder)),
    db
      .select({ action: auditLogs.action, changes: auditLogs.changes, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.entityType, "sale"), eq(auditLogs.entityId, saleId)))
      .orderBy(asc(auditLogs.createdAt)),
    db.select({ hours: businesses.businessHours, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
  ]);
  const s = row.sale;
  const netPaid = s.paidCents - s.refundedCashCents;
  // Status timeline from the order's own audit trail (stage changes only; no staff names).
  const timeline = [{ stage: "placed", at: s.createdAt.toISOString() }];
  for (const h of history) {
    const to = (h.changes as { fulfillmentStatus?: { to?: string } } | null)?.fulfillmentStatus?.to;
    if (h.action === "order.status_changed" && to) timeline.push({ stage: to, at: h.createdAt.toISOString() });
  }
  return {
    order: {
      number: s.number,
      placedAt: s.createdAt.toISOString(),
      status: s.status,
      stage: s.fulfillmentStatus,
      paymentStatus: s.paymentStatus,
      paymentOption: row.web.paymentOption,
      currency: s.currency,
      subtotalCents: s.subtotalCents,
      taxCents: s.taxCents,
      totalCents: s.totalCents,
      paidCents: netPaid,
      balanceDueCents: s.balanceDueCents,
      readyBy: s.dueOn,
      readyAt: s.readyAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      cancelledByCustomer: Boolean(row.web.cancelledByCustomerAt),
      canCancel: s.status === "open" && ["new", "confirmed"].includes(s.fulfillmentStatus) && netPaid === 0,
      contact: { name: row.web.contactName, email: row.web.contactEmail, phone: row.web.contactPhone },
      branch: {
        id: row.branch.id,
        name: row.branch.name,
        address: [row.branch.addressLine1, [row.branch.addressLine2, row.branch.city].filter(Boolean).join(", ")].filter(Boolean),
        phone: row.branch.phone,
        mapUrl: row.branch.mapUrl,
        hours: row.branch.businessHours ?? biz[0]?.hours ?? null,
      },
      items: items.map((i) => ({ name: i.productName, variantLabel: i.variantLabel, productType: i.productType, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents, note: i.productType === "made_to_order" ? i.notes : null })),
      prescriptions: row.web.prescriptions,
      timeline,
    },
  };
}

async function findByNumber(businessId: string, number: string) {
  const clean = number.trim().toUpperCase();
  if (!/^ORD-\d{1,12}$/.test(clean)) return null;
  const [row] = await getDb()
    .select({ saleId: sales.id, tokenHash: websiteOrders.accessTokenHash })
    .from(sales)
    .innerJoin(websiteOrders, and(eq(websiteOrders.businessId, sales.businessId), eq(websiteOrders.saleId, sales.id)))
    .where(and(eq(sales.businessId, businessId), eq(sales.number, clean), eq(sales.channel, "website")))
    .limit(1);
  return row ?? null;
}

/** The customer's view of their order. A wrong number or token both give 404, so neither is revealed. */
export async function getWebsiteOrder(businessId: string, number: string, token: string | null) {
  const row = await findByNumber(businessId, number);
  if (!row || !tokenMatches(token, row.tokenHash)) throw new PublicApiError(404, "Not found");
  return getWebsiteOrderById(businessId, row.saleId);
}

/**
 * "Find my order": the order number plus the email used at checkout gives back the status link's
 * token. Both must match; a miss is a 404 either way, so it doesn't reveal which part was wrong.
 */
export async function lookupWebsiteOrder(businessId: string, raw: unknown) {
  const input = z.object({ number: z.string().trim().max(40), email: z.string().trim().toLowerCase().max(200) }).parse(raw);
  const clean = input.number.toUpperCase();
  if (!/^ORD-\d{1,12}$/.test(clean) || !input.email) throw new PublicApiError(404, "Not found");
  const [row] = await getDb()
    .select({ saleId: sales.id, email: websiteOrders.contactEmail })
    .from(sales)
    .innerJoin(websiteOrders, and(eq(websiteOrders.businessId, sales.businessId), eq(websiteOrders.saleId, sales.id)))
    .where(and(eq(sales.businessId, businessId), eq(sales.number, clean), eq(sales.channel, "website")))
    .limit(1);
  if (!row || (row.email ?? "").toLowerCase() !== input.email) throw new PublicApiError(404, "Not found");
  return { number: clean, token: orderToken(row.saleId) };
}

/** The customer cancels an unpaid order before work starts; reserved stock goes back on sale. */
export async function cancelWebsiteOrder(businessId: string, number: string, token: string | null, meta: { ip?: string | null } = {}) {
  const row = await findByNumber(businessId, number);
  if (!row || !tokenMatches(token, row.tokenHash)) throw new PublicApiError(404, "Not found");
  const ctx = websiteCtx(businessId, meta.ip ?? null);
  await getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(sales).where(and(eq(sales.businessId, businessId), eq(sales.id, row.saleId))).for("update");
    if (s.status === "cancelled") return; // already cancelled: idempotent
    if (s.status !== "open" || !["new", "confirmed"].includes(s.fulfillmentStatus)) {
      throw new PublicApiError(409, "Work on this order has started, so it can't be cancelled online. Please contact the branch.");
    }
    if (s.paidCents - s.refundedCashCents > 0) throw new PublicApiError(409, "This order was paid online. Please contact the branch to cancel it.");
    await transitionInTx(tx, ctx, s.id, "cancelled", "Cancelled by the customer on the website");
    await tx.update(websiteOrders).set({ cancelledByCustomerAt: now(ctx) }).where(and(eq(websiteOrders.businessId, businessId), eq(websiteOrders.saleId, s.id)));
  });
  return getWebsiteOrderById(businessId, row.saleId);
}

// ─── Dashboard (staff) ───────────────────────────────────────────────────────

/** Website details shown on the order page in the dashboard. */
export async function websiteOrderDetails(ctx: Ctx, saleId: string) {
  const [row] = await getDb().select().from(websiteOrders).where(and(eq(websiteOrders.businessId, ctx.businessId), eq(websiteOrders.saleId, saleId))).limit(1);
  return row ?? null;
}
