import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { computeBalance, derivePaymentStatus, priceSale, PricingError, type PricingLineInput } from "@/lib/pricing";
import {
  checkoutInput,
  FULFILLMENT_LABELS,
  quoteInput,
  orderInput,
  paymentInput,
  refundInput,
  type FulfillmentStage,
} from "@/lib/schemas";
import { getDb, type Tx } from "@/server/db";
import {
  auditLogs,
  branches,
  businesses,
  businessMemberships,
  customers,
  inventoryBalances,
  inventoryLocations,
  payments,
  prescriptions,
  products,
  productVariants,
  refundItems,
  refunds,
  saleItems,
  sales,
  stockReservations,
  suppliers,
  users,
} from "@/server/db/schema";
import {
  AppError,
  audit,
  can,
  conflict,
  db,
  forbidden,
  invalid,
  isUniqueViolation,
  likePattern,
  mapDbError,
  nextNumber,
  notFound,
  now,
  pageOf,
  paging,
  ref,
  requestHash,
  requireAny,
  requirePermission,
  type Ctx,
} from "./core";
import { applyMovement, applyReservationDelta, lockBalances, locationForBranch, receiveUnits } from "./inventory";
import { onOrderReady, onSaleChanged } from "@/server/integrations/ghl/triggers";

type SaleRow = typeof sales.$inferSelect;

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Thrown inside a transaction when a concurrent request with the same key committed first. */
class Replay<T> extends Error {
  constructor(public prior: T) {
    super("replay");
  }
}

/**
 * Runs `run` in a transaction unless `lookup` finds a prior result for the same idempotency key.
 * - The stored request hash must match: a key reused with different details is rejected, never
 *   silently answered with the old result.
 * - `run` may call `recheck()` after taking its locks; a duplicate that waited on the lock then
 *   returns the first request's result instead of failing a business check.
 */
export async function idempotent<T extends object>(
  lookup: () => Promise<(T & { requestHash?: string | null }) | null>,
  run: (tx: Tx, recheck: () => Promise<void>) => Promise<T>,
  constraint: string,
  hash: string,
): Promise<T & { replayed: boolean }> {
  const replay = (prior: T & { requestHash?: string | null }) => {
    if (prior.requestHash && prior.requestHash !== hash) {
      throw conflict("This request was already processed with different details. Start again (the screen will use a new request id).");
    }
    const { requestHash: _h, ...rest } = prior;
    void _h;
    return { ...(rest as T), replayed: true };
  };
  const prior = await lookup();
  if (prior) return replay(prior);
  const recheck = async () => {
    const again = await lookup();
    if (again) throw new Replay(again);
  };
  try {
    const result = await getDb().transaction((tx) => run(tx, recheck));
    return { ...result, replayed: false };
  } catch (error) {
    if (error instanceof Replay) return replay(error.prior as T & { requestHash?: string | null });
    if (isUniqueViolation(error, constraint)) {
      const again = await lookup();
      if (again) return replay(again);
    }
    mapDbError(error);
  }
}

export async function businessTax(tx: Tx, ctx: Ctx) {
  const [b] = await tx
    .select({
      taxRateBps: businesses.taxRateBps,
      pricesIncludeTax: businesses.pricesIncludeTax,
      currency: businesses.currency,
      locale: businesses.locale,
      settings: businesses.settings,
    })
    .from(businesses)
    .where(eq(businesses.id, ctx.businessId));
  if (!b) throw notFound("Business");
  return b;
}

export async function activeBranch(tx: Tx, ctx: Ctx, branchId: string) {
  const [b] = await tx
    .select()
    .from(branches)
    .where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, branchId)))
    .limit(1);
  if (!b || !b.isActive) throw invalid("Choose an active branch.");
  return b;
}

async function activeCustomer(tx: Tx, ctx: Ctx, customerId: string) {
  const [c] = await tx
    .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, archivedAt: customers.archivedAt })
    .from(customers)
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)))
    .limit(1);
  if (!c || c.archivedAt) throw invalid("Choose an active customer.");
  return c;
}

export type LineMeta = {
  id: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  productType: "stock" | "service" | "made_to_order";
  categoryId: string;
  unitCostCents: number;
  prescriptionId: string | null;
  notes: string | null;
};

/** Loads variants from the DB and builds pricing input. Prices come from the catalogue, not the client. */
export async function buildLines(
  tx: Tx,
  ctx: Ctx,
  items: { variantId: string; quantity: number; lineDiscountCents: number; unitCostCents?: number | null; unitPriceCents?: number | null; prescriptionId: string | null; notes?: string | null }[],
  customerId: string | null,
) {
  const ids = [...new Set(items.map((i) => i.variantId))];
  const rows = await tx
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      label: productVariants.label,
      priceCents: productVariants.priceCents,
      costCents: productVariants.costCents,
      variantActive: productVariants.isActive,
      variantArchived: productVariants.archivedAt,
      productName: products.name,
      productType: products.productType,
      taxExempt: products.taxExempt,
      categoryId: products.categoryId,
      productActive: products.isActive,
      productArchived: products.archivedAt,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const rxIds = [...new Set(items.map((i) => i.prescriptionId).filter(Boolean))] as string[];
  if (rxIds.length) {
    if (!customerId) throw invalid("Link a customer before attaching a prescription.");
    const rx = await tx
      .select({ id: prescriptions.id })
      .from(prescriptions)
      .where(and(eq(prescriptions.businessId, ctx.businessId), eq(prescriptions.customerId, customerId), inArray(prescriptions.id, rxIds)));
    if (rx.length !== rxIds.length) throw invalid("A selected prescription doesn't belong to this customer.");
  }

  const pricing: PricingLineInput[] = [];
  const meta: LineMeta[] = [];
  for (const item of items) {
    const v = byId.get(item.variantId);
    if (!v) throw invalid("One of the items no longer exists.");
    if (!v.variantActive || v.variantArchived || !v.productActive || v.productArchived) {
      throw invalid(`${v.productName} (${v.sku}) is inactive and can't be sold.`);
    }
    const custom = v.productType === "made_to_order";
    const unitPrice = custom && item.unitPriceCents != null ? item.unitPriceCents : v.priceCents;
    const unitCost = custom && item.unitCostCents != null ? item.unitCostCents : v.costCents;
    const id = randomUUID();
    pricing.push({ key: id, quantity: item.quantity, unitPriceCents: unitPrice, lineDiscountCents: item.lineDiscountCents, taxExempt: v.taxExempt });
    meta.push({
      id,
      variantId: v.id,
      productName: v.productName,
      variantLabel: v.label,
      sku: v.sku,
      productType: v.productType,
      categoryId: v.categoryId,
      unitCostCents: v.productType === "service" ? 0 : unitCost,
      prescriptionId: item.prescriptionId,
      notes: item.notes ?? null,
    });
  }
  return { pricing, meta };
}

/** Largest sale total accepted (₱/$ 1 billion in minor units) — keeps all tax/allocation maths exact. */
const MAX_TOTAL_CENTS = 100_000_000_000;

export function price(pricing: PricingLineInput[], tax: { taxRateBps: number; pricesIncludeTax: boolean }, discount: Parameters<typeof priceSale>[2]) {
  const gross = pricing.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  if (!Number.isSafeInteger(gross) || gross > MAX_TOTAL_CENTS) throw invalid("That total is too large to process. Split it into smaller sales.");
  try {
    return priceSale(pricing, { rateBps: tax.taxRateBps, pricesIncludeTax: tax.pricesIncludeTax }, discount ?? null);
  } catch (error) {
    if (error instanceof PricingError) throw invalid(error.message);
    throw error;
  }
}

function enforceDiscountLimit(ctx: Ctx, priced: ReturnType<typeof priceSale>, maxBps: number) {
  if (priced.discountCents === 0 || priced.subtotalCents === 0) return;
  if (can(ctx, "sales.discount.unlimited")) return;
  if (priced.discountCents * 10000 > priced.subtotalCents * maxBps) {
    throw forbidden(`Discounts above ${maxBps / 100}% need a manager's approval.`);
  }
}

function toDiscount(d: { type: "percent"; valueBps: number } | { type: "amount"; valueCents: number } | null | undefined) {
  if (!d) return null;
  return d;
}

export async function insertItems(tx: Tx, ctx: Ctx, saleId: string, meta: LineMeta[], priced: ReturnType<typeof priceSale>) {
  await tx.insert(saleItems).values(
    meta.map((m, i) => {
      const p = priced.lines[i];
      return {
        id: m.id,
        businessId: ctx.businessId,
        saleId,
        variantId: m.variantId,
        categoryId: m.categoryId,
        productName: m.productName,
        variantLabel: m.variantLabel,
        sku: m.sku,
        productType: m.productType,
        quantity: p.quantity,
        unitPriceCents: p.unitPriceCents,
        discountCents: p.discountCents,
        taxCents: p.taxCents,
        netCents: p.netCents,
        lineTotalCents: p.lineTotalCents,
        unitCostCents: m.unitCostCents,
        prescriptionId: m.prescriptionId,
        notes: m.notes,
        sortOrder: i,
      };
    }),
  );
}

/** Stock lines aggregated per variant (the same frame may appear twice with different discounts). */
function stockNeeds(meta: LineMeta[], priced: ReturnType<typeof priceSale>) {
  const needs = new Map<string, { qty: number; name: string }>();
  meta.forEach((m, i) => {
    if (m.productType !== "stock") return;
    const prev = needs.get(m.variantId);
    needs.set(m.variantId, { qty: (prev?.qty ?? 0) + priced.lines[i].quantity, name: `${m.productName} (${m.sku})` });
  });
  return needs;
}

function assertAvailable(needs: Map<string, { qty: number; name: string }>, balances: Map<string, { onHand: number; reserved: number }>) {
  const short: string[] = [];
  for (const [variantId, need] of needs) {
    const b = balances.get(variantId);
    const available = b ? b.onHand - b.reserved : 0;
    if (available < need.qty) short.push(`${need.name}: ${Math.max(0, available)} available, ${need.qty} needed`);
  }
  if (short.length) throw new AppError(`Not enough stock — ${short.join("; ")}.`, "conflict");
}

function validatePayment(p: { method: string; amountCents: number; tenderedCents?: number | null }) {
  if (p.method === "cash") {
    const tendered = p.tenderedCents ?? p.amountCents;
    if (tendered < p.amountCents) throw invalid("Cash tendered is less than the payment amount.");
    return { tenderedCents: tendered, changeCents: tendered - p.amountCents };
  }
  return { tenderedCents: null, changeCents: null };
}

async function lockSale(tx: Tx, ctx: Ctx, saleId: string): Promise<SaleRow> {
  const [s] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, saleId)))
    .for("update");
  if (!s) throw notFound("Sale");
  return s;
}

/** Recomputes balance + payment status after any money movement and persists them. */
export async function settle(tx: Tx, ctx: Ctx, s: Pick<SaleRow, "id" | "totalCents" | "paidCents" | "refundedCents" | "refundedCashCents" | "status">) {
  const balance = s.status === "cancelled" ? 0 : computeBalance(s);
  if (balance < 0) throw conflict("This would leave the sale overpaid.");
  const paymentStatus = derivePaymentStatus({ totalCents: s.totalCents, paidCents: s.paidCents - s.refundedCashCents, balanceDueCents: balance });
  await tx
    .update(sales)
    .set({
      paidCents: s.paidCents,
      refundedCents: s.refundedCents,
      refundedCashCents: s.refundedCashCents,
      balanceDueCents: balance,
      paymentStatus,
      updatedAt: now(ctx),
    })
    .where(eq(sales.id, s.id));
  return { balanceDueCents: balance, paymentStatus };
}

const money = (cents: number) => formatMoney(cents);

// ─── POS checkout ────────────────────────────────────────────────────────────

export async function checkout(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "pos.use");
  const input = checkoutInput.parse(raw);
  const hash = requestHash(input as unknown as Record<string, unknown>);
  const lookup = async () => {
    const [s] = await db()
      .select({ saleId: sales.id, number: sales.number, totalCents: sales.totalCents, balanceDueCents: sales.balanceDueCents, requestHash: sales.requestHash })
      .from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    return s ?? null;
  };

  return idempotent(
    lookup,
    async (tx) => {
      const tax = await businessTax(tx, ctx);
      const branch = await activeBranch(tx, ctx, input.branchId);
      const location = await locationForBranch(tx, ctx, branch.id);
      if (input.customerId) await activeCustomer(tx, ctx, input.customerId);

      const { pricing, meta } = await buildLines(tx, ctx, input.items, input.customerId);
      const priced = price(pricing, tax, toDiscount(input.orderDiscount));
      enforceDiscountLimit(ctx, priced, tax.settings.maxStaffDiscountBps ?? 2000);

      const paid = input.payments.reduce((s, p) => s + p.amountCents, 0);
      if (paid > priced.totalCents) throw invalid("Payments exceed the sale total. Enter the amount applied, and record cash tendered separately.");
      if (paid < priced.totalCents && !input.customerId) throw invalid("Link a customer to leave a balance due on this sale.");
      const tenders = input.payments.map(validatePayment);

      const saleId: string = randomUUID();
      const number = await nextNumber(tx, ctx.businessId, "sale", "S-");
      const at = now(ctx);
      const cost = meta.reduce((s, m, i) => s + m.unitCostCents * priced.lines[i].quantity, 0);

      await tx.insert(sales).values({
        id: saleId,
        businessId: ctx.businessId,
        number,
        kind: "pos",
        status: "completed",
        fulfillmentStatus: "completed",
        paymentStatus: "unpaid",
        branchId: branch.id,
        locationId: location.id,
        customerId: input.customerId,
        soldByMembershipId: ctx.membershipId,
        currency: tax.currency,
        taxRateBps: tax.taxRateBps,
        pricesIncludeTax: tax.pricesIncludeTax,
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        costCents: cost,
        balanceDueCents: priced.totalCents,
        orderDiscountType: input.orderDiscount?.type ?? null,
        orderDiscountValue: input.orderDiscount ? (input.orderDiscount.type === "percent" ? input.orderDiscount.valueBps : input.orderDiscount.valueCents) : null,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        createdAt: at,
        completedAt: at,
        updatedAt: at,
      });
      await insertItems(tx, ctx, saleId, meta, priced);

      // Inventory: lock, verify availability, deduct — all inside this transaction.
      const needs = stockNeeds(meta, priced);
      if (needs.size) {
        const balances = await lockBalances(tx, ctx, location.id, [...needs.keys()]);
        assertAvailable(needs, balances);
        for (let i = 0; i < meta.length; i++) {
          const m = meta[i];
          if (m.productType !== "stock") continue;
          await applyMovement(tx, ctx, balances, {
            variantId: m.variantId,
            locationId: location.id,
            type: "sale",
            quantity: -priced.lines[i].quantity,
            unitCostCents: m.unitCostCents,
            reason: `Sale ${number}`,
            referenceType: "sale",
            referenceId: saleId,
            referenceLineId: m.id,
            idempotencyKey: `sale:${saleId}:${m.id}`,
          });
        }
      }

      for (let i = 0; i < input.payments.length; i++) {
        const p = input.payments[i];
        await tx.insert(payments).values({
          businessId: ctx.businessId,
          saleId,
          method: p.method,
          amountCents: p.amountCents,
          tenderedCents: tenders[i].tenderedCents,
          changeCents: tenders[i].changeCents,
          reference: p.reference,
          receivedByMembershipId: ctx.membershipId,
          receivedAt: at,
          idempotencyKey: `${input.idempotencyKey}:p${i}`,
          createdAt: at,
        });
      }
      const settled = await settle(tx, ctx, { id: saleId, totalCents: priced.totalCents, paidCents: paid, refundedCents: 0, refundedCashCents: 0, status: "completed" });

      await onSaleChanged(tx, ctx.businessId, saleId);
      await audit(tx, ctx, {
        action: "sale.completed",
        entityType: "sale",
        entityId: saleId,
        summary: `Completed sale ${number} · ${money(priced.totalCents)} · ${meta.length} line(s)${settled.balanceDueCents > 0 ? ` · ${money(settled.balanceDueCents)} due` : ""}`,
      });
      return { saleId, number, totalCents: priced.totalCents, balanceDueCents: settled.balanceDueCents };
    },
    "sales_idempotency_key",
    hash,
  );
}

/**
 * Pre-checkout validation for the POS: prices the cart on the server exactly as checkout would and
 * reports discount and stock problems. Writes nothing and takes no locks, so it is advisory; checkout
 * repeats every check under lock and is the authority.
 */
export async function quoteCart(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "pos.use");
  const input = quoteInput.parse(raw);
  return getDb().transaction(
    async (tx) => {
      const tax = await businessTax(tx, ctx);
      const branch = await activeBranch(tx, ctx, input.branchId);
      const location = await locationForBranch(tx, ctx, branch.id);
      if (input.customerId) await activeCustomer(tx, ctx, input.customerId);
      const { pricing, meta } = await buildLines(tx, ctx, input.items, input.customerId);
      const priced = price(pricing, tax, toDiscount(input.orderDiscount));
      const problems: string[] = [];
      try {
        enforceDiscountLimit(ctx, priced, tax.settings.maxStaffDiscountBps ?? 2000);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push(error.message);
      }
      const needs = stockNeeds(meta, priced);
      const available: Record<string, number> = {};
      if (needs.size) {
        const rows = await tx
          .select({ variantId: inventoryBalances.variantId, onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved })
          .from(inventoryBalances)
          .where(and(eq(inventoryBalances.businessId, ctx.businessId), eq(inventoryBalances.locationId, location.id), inArray(inventoryBalances.variantId, [...needs.keys()])));
        const byVariant = new Map(rows.map((r) => [r.variantId, Math.max(0, r.onHand - r.reserved)]));
        for (const [variantId, need] of needs) {
          const qty = byVariant.get(variantId) ?? 0;
          available[variantId] = qty;
          if (qty < need.qty) problems.push(`${need.name}: only ${qty} left at this branch (${need.qty} in the cart).`);
        }
      }
      return {
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        lines: meta.map((m, i) => ({ variantId: m.variantId, unitPriceCents: priced.lines[i].unitPriceCents, lineTotalCents: priced.lines[i].lineTotalCents })),
        available,
        problems,
        checkedAt: new Date().toISOString(),
      };
    },
    { accessMode: "read only" },
  );
}

// ─── Customer orders ─────────────────────────────────────────────────────────

export async function createOrder(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "orders.manage");
  const input = orderInput.parse(raw);
  const hash = requestHash(input as unknown as Record<string, unknown>);
  const lookup = async () => {
    const [s] = await db()
      .select({ saleId: sales.id, number: sales.number, requestHash: sales.requestHash })
      .from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    return s ?? null;
  };
  return idempotent(
    lookup,
    async (tx) => {
      const tax = await businessTax(tx, ctx);
      const branch = await activeBranch(tx, ctx, input.branchId);
      const location = await locationForBranch(tx, ctx, branch.id);
      await activeCustomer(tx, ctx, input.customerId);
      if (input.labSupplierId) await assertSupplier(tx, ctx, input.labSupplierId);

      const { pricing, meta } = await buildLines(tx, ctx, input.items, input.customerId);
      const priced = price(pricing, tax, toDiscount(input.orderDiscount));
      enforceDiscountLimit(ctx, priced, tax.settings.maxStaffDiscountBps ?? 2000);
      if (input.deposit && input.deposit.amountCents > priced.totalCents) throw invalid("The deposit can't exceed the order total.");

      const saleId: string = randomUUID();
      const number = await nextNumber(tx, ctx.businessId, "order", "ORD-");
      const at = now(ctx);
      const cost = meta.reduce((s, m, i) => s + m.unitCostCents * priced.lines[i].quantity, 0);
      await tx.insert(sales).values({
        id: saleId,
        businessId: ctx.businessId,
        number,
        kind: "order",
        status: "open",
        fulfillmentStatus: "new",
        paymentStatus: "unpaid",
        branchId: branch.id,
        locationId: location.id,
        customerId: input.customerId,
        soldByMembershipId: ctx.membershipId,
        currency: tax.currency,
        taxRateBps: tax.taxRateBps,
        pricesIncludeTax: tax.pricesIncludeTax,
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        costCents: cost,
        balanceDueCents: priced.totalCents,
        orderDiscountType: input.orderDiscount?.type ?? null,
        orderDiscountValue: input.orderDiscount ? (input.orderDiscount.type === "percent" ? input.orderDiscount.valueBps : input.orderDiscount.valueCents) : null,
        notes: input.notes,
        dueOn: input.dueOn,
        labSupplierId: input.labSupplierId,
        labReference: input.labReference,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        createdAt: at,
        updatedAt: at,
      });
      await insertItems(tx, ctx, saleId, meta, priced);

      let paid = 0;
      if (input.deposit) {
        const tender = validatePayment(input.deposit);
        await tx.insert(payments).values({
          businessId: ctx.businessId,
          saleId,
          method: input.deposit.method,
          amountCents: input.deposit.amountCents,
          tenderedCents: tender.tenderedCents,
          changeCents: tender.changeCents,
          reference: input.deposit.reference,
          receivedByMembershipId: ctx.membershipId,
          receivedAt: at,
          notes: "Deposit",
          idempotencyKey: `${input.idempotencyKey}:deposit`,
          createdAt: at,
        });
        paid = input.deposit.amountCents;
      }
      await settle(tx, ctx, { id: saleId, totalCents: priced.totalCents, paidCents: paid, refundedCents: 0, refundedCashCents: 0, status: "open" });
      await onSaleChanged(tx, ctx.businessId, saleId);
      await audit(tx, ctx, {
        action: "order.created",
        entityType: "sale",
        entityId: saleId,
        summary: `Created order ${number} · ${money(priced.totalCents)}${paid ? ` · deposit ${money(paid)}` : ""}`,
      });
      if (input.confirm) await transitionInTx(tx, ctx, saleId, "confirmed", null);
      return { saleId, number };
    },
    "sales_idempotency_key",
    hash,
  );
}

async function assertSupplier(tx: Tx, ctx: Ctx, supplierId: string) {
  const [s] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, supplierId)))
    .limit(1);
  if (!s) throw invalid("Unknown supplier / lab.");
}

const TRANSITIONS: Record<FulfillmentStage, FulfillmentStage[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["awaiting_lab", "ready_for_pickup", "cancelled"],
  awaiting_lab: ["processing", "ready_for_pickup", "cancelled"],
  ready_for_pickup: ["completed", "processing", "cancelled"],
  completed: [],
  cancelled: [],
};

export function allowedTransitions(stage: FulfillmentStage): FulfillmentStage[] {
  return TRANSITIONS[stage];
}

export async function transitionOrder(ctx: Ctx, saleId: string, to: FulfillmentStage, reason: string | null = null) {
  requirePermission(ctx, "orders.manage");
  if (to === "cancelled") requirePermission(ctx, "sales.cancel");
  try {
    return await getDb().transaction((tx) => transitionInTx(tx, ctx, saleId, to, reason));
  } catch (error) {
    mapDbError(error);
  }
}

export async function transitionInTx(tx: Tx, ctx: Ctx, saleId: string, to: FulfillmentStage, reason: string | null) {
  const sale = await lockSale(tx, ctx, saleId);
  if (sale.kind !== "order") throw invalid("Only customer orders have fulfilment stages.");
  const from = sale.fulfillmentStatus as FulfillmentStage;
  if (!TRANSITIONS[from].includes(to)) {
    throw invalid(`An order can't move from ${FULFILLMENT_LABELS[from]} to ${FULFILLMENT_LABELS[to]}.`);
  }
  const at = now(ctx);
  const items = await tx.select().from(saleItems).where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId)));
  const stockItems = items.filter((i) => i.productType === "stock");
  const patch: Partial<SaleRow> = { fulfillmentStatus: to, updatedAt: at };
  let note = "";

  if (to === "confirmed" && stockItems.length) {
    // Reserve every stocked unit so it can't be sold to someone else while the job is in progress.
    const balances = await lockBalances(tx, ctx, sale.locationId, stockItems.map((i) => i.variantId));
    const needs = new Map<string, { qty: number; name: string }>();
    for (const i of stockItems) {
      const prev = needs.get(i.variantId);
      needs.set(i.variantId, { qty: (prev?.qty ?? 0) + i.quantity, name: `${i.productName} (${i.sku})` });
    }
    assertAvailable(needs, balances);
    for (const i of stockItems) {
      await applyReservationDelta(tx, ctx, balances, i.variantId, i.quantity);
      await tx.insert(stockReservations).values({
        businessId: ctx.businessId,
        variantId: i.variantId,
        locationId: sale.locationId,
        saleId,
        saleItemId: i.id,
        quantity: i.quantity,
        status: "active",
        createdAt: at,
      });
    }
    note = ` · reserved ${stockItems.reduce((s, i) => s + i.quantity, 0)} unit(s)`;
  }

  if (to === "completed") {
    // Handover: reserved units leave stock now, and revenue is recognised.
    const active = await tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.businessId, ctx.businessId), eq(stockReservations.saleId, saleId), eq(stockReservations.status, "active")));
    const reservedByItem = new Map(active.map((r) => [r.saleItemId, r]));
    if (stockItems.length) {
      const balances = await lockBalances(tx, ctx, sale.locationId, stockItems.map((i) => i.variantId));
      // COGS is recognised now, so use today's moving-average cost (not the cost when the order was taken).
      const costs = await tx
        .select({ id: productVariants.id, costCents: productVariants.costCents })
        .from(productVariants)
        .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.id, [...new Set(stockItems.map((i) => i.variantId))])))
        .for("update");
      const costOf = new Map(costs.map((c) => [c.id, c.costCents]));
      for (const i of stockItems) {
        const current = costOf.get(i.variantId) ?? i.unitCostCents;
        if (current !== i.unitCostCents) {
          await tx.update(saleItems).set({ unitCostCents: current }).where(eq(saleItems.id, i.id));
          i.unitCostCents = current;
        }
      }
      patch.costCents = items.reduce((sum, i) => sum + i.unitCostCents * i.quantity, 0);
      const unreserved = stockItems.filter((i) => !reservedByItem.has(i.id));
      if (unreserved.length) {
        const needs = new Map<string, { qty: number; name: string }>();
        for (const i of unreserved) needs.set(i.variantId, { qty: (needs.get(i.variantId)?.qty ?? 0) + i.quantity, name: `${i.productName} (${i.sku})` });
        assertAvailable(needs, balances);
      }
      for (const i of stockItems) {
        const r = reservedByItem.get(i.id);
        await applyMovement(tx, ctx, balances, {
          variantId: i.variantId,
          locationId: sale.locationId,
          type: "order_consumption",
          quantity: -i.quantity,
          reservedDelta: r ? -r.quantity : 0,
          unitCostCents: i.unitCostCents,
          reason: `Order ${sale.number} handed over`,
          referenceType: "sale",
          referenceId: saleId,
          referenceLineId: i.id,
          idempotencyKey: `order:${saleId}:${i.id}`,
        });
        if (r) await tx.update(stockReservations).set({ status: "consumed", consumedAt: at }).where(eq(stockReservations.id, r.id));
      }
    }
    patch.status = "completed";
    patch.completedAt = at;
  }

  if (to === "cancelled") {
    const netPaid = sale.paidCents - sale.refundedCashCents;
    if (netPaid > 0) throw invalid(`Refund the ${money(netPaid)} collected on this order before cancelling it.`);
    const active = await tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.businessId, ctx.businessId), eq(stockReservations.saleId, saleId), eq(stockReservations.status, "active")));
    if (active.length) {
      const balances = await lockBalances(tx, ctx, sale.locationId, active.map((r) => r.variantId));
      for (const r of active) {
        await applyReservationDelta(tx, ctx, balances, r.variantId, -r.quantity);
        await tx.update(stockReservations).set({ status: "released", releasedAt: at }).where(eq(stockReservations.id, r.id));
      }
      note = ` · released ${active.reduce((s, r) => s + r.quantity, 0)} reserved unit(s)`;
    }
    patch.status = "cancelled";
    patch.cancelledAt = at;
    patch.cancelReason = reason;
    patch.balanceDueCents = 0;
  }

  if (to === "ready_for_pickup") patch.readyAt = at;
  await tx.update(sales).set(patch).where(eq(sales.id, saleId));

  if (to === "ready_for_pickup") {
    const queued = sale.customerId ? await onOrderReady(tx, ctx.businessId, saleId, at.getTime()) : false;
    note += queued ? " · customer notification queued (GoHighLevel)" : " · no customer message sent (messaging not configured)";
  }

  await onSaleChanged(tx, ctx.businessId, saleId);
  await audit(tx, ctx, {
    action: "order.status_changed",
    entityType: "sale",
    entityId: saleId,
    summary: `${sale.number}: ${FULFILLMENT_LABELS[from]} → ${FULFILLMENT_LABELS[to]}${note}${reason ? ` · ${reason}` : ""}`,
    changes: { fulfillmentStatus: { from, to } },
  });
  return { saleId, fulfillmentStatus: to };
}

/** Edits an order. Line items can only change before stock is reserved (stage "New order"). */
export async function updateOrder(
  ctx: Ctx,
  saleId: string,
  raw: { items?: unknown; orderDiscount?: unknown; dueOn?: string | null; labSupplierId?: string | null; labReference?: string | null; notes?: string | null },
) {
  requirePermission(ctx, "orders.manage");
  const parsed = orderInput
    .pick({ items: true, orderDiscount: true, dueOn: true, labSupplierId: true, labReference: true, notes: true })
    .partial()
    .parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const sale = await lockSale(tx, ctx, saleId);
      if (sale.kind !== "order") throw invalid("Only customer orders can be edited.");
      if (sale.status !== "open") throw invalid("Completed or cancelled orders can't be edited.");
      if (parsed.labSupplierId) await assertSupplier(tx, ctx, parsed.labSupplierId);
      const patch: Partial<SaleRow> = { updatedAt: now(ctx) };
      if (parsed.dueOn !== undefined) patch.dueOn = parsed.dueOn;
      if (parsed.labSupplierId !== undefined) patch.labSupplierId = parsed.labSupplierId;
      if (parsed.labReference !== undefined) patch.labReference = parsed.labReference;
      if (parsed.notes !== undefined) patch.notes = parsed.notes;

      if (parsed.items) {
        if (sale.fulfillmentStatus !== "new") throw invalid("Items can only be changed while the order is still New. Cancel and re-create it instead.");
        const tax = { taxRateBps: sale.taxRateBps, pricesIncludeTax: sale.pricesIncludeTax };
        const { pricing, meta } = await buildLines(tx, ctx, parsed.items, sale.customerId);
        const stored =
          sale.orderDiscountType && sale.orderDiscountValue != null
            ? sale.orderDiscountType === "percent"
              ? { type: "percent" as const, valueBps: sale.orderDiscountValue }
              : { type: "amount" as const, valueCents: sale.orderDiscountValue }
            : null;
        const discount = parsed.orderDiscount !== undefined ? toDiscount(parsed.orderDiscount) : stored;
        const priced = price(pricing, tax, discount);
        const b = await businessTax(tx, ctx);
        enforceDiscountLimit(ctx, priced, b.settings.maxStaffDiscountBps ?? 2000);
        if (priced.totalCents < sale.paidCents - sale.refundedCashCents) throw invalid("The new total is lower than what the customer has already paid. Refund the difference first.");
        await tx.delete(saleItems).where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId)));
        await insertItems(tx, ctx, saleId, meta, priced);
        Object.assign(patch, {
          subtotalCents: priced.subtotalCents,
          discountCents: priced.discountCents,
          taxCents: priced.taxCents,
          totalCents: priced.totalCents,
          costCents: meta.reduce((s, m, i) => s + m.unitCostCents * priced.lines[i].quantity, 0),
          orderDiscountType: discount?.type ?? null,
          orderDiscountValue: discount ? (discount.type === "percent" ? discount.valueBps : discount.valueCents) : null,
        });
        await tx.update(sales).set(patch).where(eq(sales.id, saleId));
        await settle(tx, ctx, { ...sale, totalCents: priced.totalCents });
      } else {
        await tx.update(sales).set(patch).where(eq(sales.id, saleId));
      }
      await onSaleChanged(tx, ctx.businessId, saleId);
      await audit(tx, ctx, { action: "order.updated", entityType: "sale", entityId: saleId, summary: `Updated order ${sale.number}` });
      return { saleId };
    });
  } catch (error) {
    mapDbError(error);
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function recordPayment(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "payments.record");
  const input = paymentInput.parse(raw);
  const hash = requestHash(input as unknown as Record<string, unknown>);
  const lookup = async () => {
    const [p] = await db()
      .select({ paymentId: payments.id, saleId: payments.saleId, requestHash: payments.requestHash })
      .from(payments)
      .where(and(eq(payments.businessId, ctx.businessId), eq(payments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    return p ?? null;
  };
  return idempotent(
    lookup,
    async (tx, recheck) => {
      const sale = await lockSale(tx, ctx, input.saleId);
      await recheck();
      if (sale.status === "cancelled") throw invalid("Payments can't be recorded on a cancelled sale.");
      if (input.amountCents > sale.balanceDueCents) {
        throw invalid(sale.balanceDueCents === 0 ? "This sale is already fully paid." : `The balance due is ${money(sale.balanceDueCents)}. Enter that amount or less.`);
      }
      const tender = validatePayment(input);
      const at = now(ctx);
      const [p] = await tx
        .insert(payments)
        .values({
          businessId: ctx.businessId,
          saleId: sale.id,
          method: input.method,
          amountCents: input.amountCents,
          tenderedCents: tender.tenderedCents,
          changeCents: tender.changeCents,
          reference: input.reference,
          notes: input.notes,
          receivedByMembershipId: ctx.membershipId,
          receivedAt: at,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          createdAt: at,
        })
        .returning({ id: payments.id });
      const settled = await settle(tx, ctx, { ...sale, paidCents: sale.paidCents + input.amountCents });
      await onSaleChanged(tx, ctx.businessId, sale.id);
      await audit(tx, ctx, {
        action: "payment.recorded",
        entityType: "sale",
        entityId: sale.id,
        summary: `Recorded ${money(input.amountCents)} (${input.method.replace("_", " ")}) on ${sale.number} · balance ${money(settled.balanceDueCents)}`,
      });
      return { paymentId: p.id, saleId: sale.id };
    },
    "payments_idempotency_key",
    hash,
  );
}

export async function voidPayment(ctx: Ctx, paymentId: string, reason: string) {
  requirePermission(ctx, "payments.void");
  if (!reason?.trim()) throw invalid("Give a reason for voiding this payment.");
  try {
    return await getDb().transaction(async (tx) => {
      const [ref] = await tx
        .select({ saleId: payments.saleId })
        .from(payments)
        .where(and(eq(payments.businessId, ctx.businessId), eq(payments.id, paymentId)))
        .limit(1);
      if (!ref) throw notFound("Payment");
      // Lock the sale, then re-read the payment under lock: a concurrent void must see it already voided.
      const sale = await lockSale(tx, ctx, ref.saleId);
      const [p] = await tx.select().from(payments).where(and(eq(payments.businessId, ctx.businessId), eq(payments.id, paymentId))).for("update");
      if (!p || p.status !== "completed") throw invalid("This payment is already voided.");
      const paid = sale.paidCents - p.amountCents;
      if (sale.refundedCashCents > paid) throw invalid("Money has already been refunded against this payment. Void the refund's effect first.");
      const at = now(ctx);
      await tx.update(payments).set({ status: "voided", voidedAt: at, voidReason: reason.trim() }).where(eq(payments.id, p.id));
      await settle(tx, ctx, { ...sale, paidCents: paid });
      await onSaleChanged(tx, ctx.businessId, sale.id);
      await audit(tx, ctx, {
        action: "payment.voided",
        entityType: "sale",
        entityId: sale.id,
        summary: `Voided ${money(p.amountCents)} payment on ${sale.number}: ${reason.trim()}`,
      });
      return { saleId: sale.id };
    });
  } catch (error) {
    mapDbError(error);
  }
}

// ─── Refunds & cancellation ──────────────────────────────────────────────────

/** Pro-rata share of a line amount for units [before, after) so repeated partial refunds sum exactly. */
const share = (amount: number, qty: number, before: number, after: number) =>
  Math.round((amount * after) / qty) - Math.round((amount * before) / qty);

export async function refundSale(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "sales.refund");
  const input = refundInput.parse(raw);
  const hash = requestHash(input as unknown as Record<string, unknown>);
  const lookup = async () => {
    const [r] = await db()
      .select({ refundId: refunds.id, number: refunds.number, saleId: refunds.saleId, requestHash: refunds.requestHash })
      .from(refunds)
      .where(and(eq(refunds.businessId, ctx.businessId), eq(refunds.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    return r ?? null;
  };
  return idempotent(
    lookup,
    async (tx, recheck) => {
      const sale = await lockSale(tx, ctx, input.saleId);
      await recheck();
      if (sale.status === "cancelled") throw invalid("This sale was cancelled.");
      if (input.items.length && sale.status !== "completed") throw invalid("Items can only be returned after the order has been handed over. Use a deposit refund instead.");
      if (!input.items.length && !input.amountCents) throw invalid("Choose items to return or enter a refund amount.");

      const lines = await tx
        .select()
        .from(saleItems)
        .where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, sale.id)))
        .for("update");
      const byId = new Map(lines.map((l) => [l.id, l]));
      const refundId: string = randomUUID();
      const at = now(ctx);
      let itemsAmount = 0;
      let itemsTax = 0;
      let costReversal = 0;
      const restock: { line: (typeof lines)[number]; qty: number }[] = [];
      const rows: (typeof refundItems.$inferInsert)[] = [];

      const seen = new Set<string>();
      for (const item of input.items) {
        if (seen.has(item.saleItemId)) throw invalid("Each line can only appear once in a refund.");
        seen.add(item.saleItemId);
        const line = byId.get(item.saleItemId);
        if (!line) throw invalid("A returned item isn't part of this sale.");
        const remaining = line.quantity - line.refundedQuantity;
        if (item.quantity > remaining) throw invalid(`Only ${remaining} × ${line.productName} can still be returned.`);
        const before = line.refundedQuantity;
        const after = before + item.quantity;
        const amount = share(line.lineTotalCents, line.quantity, before, after);
        itemsAmount += amount;
        itemsTax += share(line.taxCents, line.quantity, before, after);
        const doRestock = item.restock && line.productType === "stock";
        if (doRestock) {
          costReversal += line.unitCostCents * item.quantity;
          restock.push({ line, qty: item.quantity });
        }
        rows.push({ businessId: ctx.businessId, refundId, saleItemId: line.id, quantity: item.quantity, amountCents: amount, restock: doRestock });
        await tx.update(saleItems).set({ refundedQuantity: after }).where(eq(saleItems.id, line.id));
      }

      const amount = input.amountCents ?? itemsAmount;
      // A zero amount is only valid when returning free lines (restock without paying anything back).
      if (amount < 0 || (amount === 0 && !input.items.length)) throw invalid("The refund amount must be greater than zero.");
      const isCash = input.method !== "balance_adjustment";
      const netCollected = sale.paidCents - sale.refundedCashCents;
      // On an order that hasn't been handed over, a refund just returns money (deposit); it doesn't change the order's value.
      const isDepositReturn = sale.status === "open";
      if (isDepositReturn && !isCash) throw invalid("A deposit refund must be paid back to the customer. To change the order's value, edit the order.");
      if (!isDepositReturn) {
        const remainingValue = sale.totalCents - sale.refundedCents;
        if (amount > remainingValue) throw invalid(`Only ${money(remainingValue)} of this sale can still be refunded.`);
      }
      if (isCash && amount > netCollected) {
        throw invalid(`Only ${money(netCollected)} has been collected, so that's the most you can pay back.${isDepositReturn ? "" : " Credit the rest to the balance instead."}`);
      }
      if (!isCash && amount > sale.balanceDueCents) throw invalid(`The balance due is only ${money(sale.balanceDueCents)}.`);
      // Tax refunded: the returned lines' own tax; with a typed amount on returned lines, their tax ratio
      // (not the whole sale's — lines can be taxed differently); amount-only refunds allocate the sale's
      // tax cumulatively so repeated partial refunds never return more tax than was collected.
      let tax = 0;
      if (!isDepositReturn) {
        if (input.items.length && input.amountCents == null) tax = itemsTax;
        else if (input.items.length) tax = itemsAmount > 0 ? Math.round((amount * itemsTax) / itemsAmount) : 0;
        else if (sale.totalCents > 0) {
          const before = Math.round((sale.taxCents * sale.refundedCents) / sale.totalCents);
          const after = Math.round((sale.taxCents * (sale.refundedCents + amount)) / sale.totalCents);
          tax = after - before;
        }
        const [{ refundedTax }] = await tx
          .select({ refundedTax: sql<number>`coalesce(sum(${refunds.taxCents}), 0)::bigint` })
          .from(refunds)
          .where(and(eq(refunds.businessId, ctx.businessId), eq(refunds.saleId, sale.id), eq(refunds.affectsRevenue, true)));
        tax = Math.max(0, Math.min(tax, sale.taxCents - Number(refundedTax)));
      }

      const number = await nextNumber(tx, ctx.businessId, "refund", "RF-");
      await tx.insert(refunds).values({
        id: refundId,
        businessId: ctx.businessId,
        number,
        saleId: sale.id,
        amountCents: amount,
        taxCents: Math.min(tax, amount),
        costReversalCents: costReversal,
        method: input.method,
        affectsRevenue: !isDepositReturn,
        reason: input.reason,
        processedByMembershipId: ctx.membershipId,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        createdAt: at,
      });
      if (rows.length) await tx.insert(refundItems).values(rows);

      if (restock.length) {
        const balances = await lockBalances(tx, ctx, sale.locationId, restock.map((r) => r.line.variantId));
        for (const r of restock) {
          await receiveUnits(tx, ctx, balances, {
            type: "sale_return",
            variantId: r.line.variantId,
            locationId: sale.locationId,
            quantity: r.qty,
            unitCostCents: r.line.unitCostCents,
            reason: `Return on ${sale.number} (${number}): ${input.reason}`,
            referenceType: "refund",
            referenceId: refundId,
            referenceLineId: r.line.id,
            idempotencyKey: `refund:${refundId}:${r.line.id}`,
          });
        }
      }

      const settled = await settle(tx, ctx, {
        ...sale,
        refundedCents: sale.refundedCents + (isDepositReturn ? 0 : amount),
        refundedCashCents: sale.refundedCashCents + (isCash ? amount : 0),
      });
      await onSaleChanged(tx, ctx.businessId, sale.id);
      await audit(tx, ctx, {
        action: "sale.refunded",
        entityType: "sale",
        entityId: sale.id,
        summary: `${isDepositReturn ? "Deposit refund" : "Refund"} ${number} on ${sale.number}: ${money(amount)} ${isCash ? `paid back (${input.method.replace("_", " ")})` : "credited to balance"}${restock.length ? ` · ${restock.reduce((s, r) => s + r.qty, 0)} unit(s) restocked` : ""} · ${input.reason}`,
        changes: { balanceDueCents: settled.balanceDueCents },
      });
      return { refundId, number, saleId: sale.id };
    },
    "refunds_idempotency_key",
    hash,
  );
}

/** Voids a POS sale that has no money collected. Stock returns to the shelf. */
export async function cancelSale(ctx: Ctx, saleId: string, reason: string) {
  requirePermission(ctx, "sales.cancel");
  if (!reason?.trim()) throw invalid("Give a reason for cancelling.");
  try {
    return await getDb().transaction(async (tx) => {
      const sale = await lockSale(tx, ctx, saleId);
      if (sale.kind === "order") return transitionInTx(tx, ctx, saleId, "cancelled", reason.trim());
      if (sale.status !== "completed") throw invalid("This sale is already cancelled.");
      if (sale.refundedCents > 0) throw invalid("This sale has refunds. Use a refund for any remaining items instead.");
      if (sale.paidCents > 0) throw invalid(`Refund the ${money(sale.paidCents)} collected before cancelling, or process a full refund.`);
      const at = now(ctx);
      const lines = await tx.select().from(saleItems).where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId)));
      const stock = lines.filter((l) => l.productType === "stock");
      if (stock.length) {
        const balances = await lockBalances(tx, ctx, sale.locationId, stock.map((l) => l.variantId));
        for (const l of stock) {
          await receiveUnits(tx, ctx, balances, {
            type: "sale_return",
            variantId: l.variantId,
            locationId: sale.locationId,
            quantity: l.quantity,
            unitCostCents: l.unitCostCents,
            reason: `Sale ${sale.number} cancelled: ${reason.trim()}`,
            referenceType: "sale",
            referenceId: saleId,
            referenceLineId: l.id,
            idempotencyKey: `cancel:${saleId}:${l.id}`,
          });
        }
      }
      await tx
        .update(sales)
        .set({ status: "cancelled", cancelledAt: at, cancelReason: reason.trim(), balanceDueCents: 0, updatedAt: at })
        .where(eq(sales.id, saleId));
      await onSaleChanged(tx, ctx.businessId, saleId);
      await audit(tx, ctx, { action: "sale.cancelled", entityType: "sale", entityId: saleId, summary: `Cancelled sale ${sale.number}: ${reason.trim()}` });
      return { saleId };
    });
  } catch (error) {
    mapDbError(error);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export type SalesFilter = {
  kind?: "pos" | "order" | null;
  q?: string;
  status?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  branchId?: string | null;
  soldBy?: string | null;
  customerId?: string | null;
  from?: Date;
  to?: Date;
  openOnly?: boolean;
  withBalance?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export async function listSales(ctx: Ctx, f: SalesFilter) {
  if (f.kind === "order") requirePermission(ctx, "orders.view");
  else requirePermission(ctx, "sales.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(sales.businessId, ctx.businessId)];
  if (f.kind) conds.push(eq(sales.kind, f.kind));
  if (f.status) conds.push(sql`${sales.status} = ${f.status}`);
  if (f.paymentStatus) conds.push(sql`${sales.paymentStatus} = ${f.paymentStatus}`);
  if (f.fulfillmentStatus) conds.push(sql`${sales.fulfillmentStatus} = ${f.fulfillmentStatus}`);
  if (f.branchId) conds.push(eq(sales.branchId, f.branchId));
  if (f.soldBy) conds.push(eq(sales.soldByMembershipId, f.soldBy));
  if (f.customerId) conds.push(eq(sales.customerId, f.customerId));
  if (f.from) conds.push(gte(sales.createdAt, f.from));
  if (f.to) conds.push(lt(sales.createdAt, f.to));
  if (f.openOnly) conds.push(eq(sales.status, "open"));
  if (f.withBalance) conds.push(gt(sales.balanceDueCents, 0), ne(sales.status, "cancelled"));
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(sql`(${sales.number} ilike ${p} or ${customers.firstName} || ' ' || ${customers.lastName} ilike ${p} or coalesce(${customers.phone}, '') ilike ${p} or coalesce(${sales.labReference}, '') ilike ${p})`);
  }
  const sortCol =
    {
      date: sales.createdAt,
      number: sales.number,
      total: sales.totalCents,
      balance: sales.balanceDueCents,
      due: sales.dueOn,
      customer: customers.lastName,
    }[f.sort ?? "date"] ?? sales.createdAt;
  const where = and(...conds);
  const rows = await db()
    .select({
      id: sales.id,
      number: sales.number,
      kind: sales.kind,
      channel: sales.channel,
      status: sales.status,
      fulfillmentStatus: sales.fulfillmentStatus,
      paymentStatus: sales.paymentStatus,
      totalCents: sales.totalCents,
      paidCents: sales.paidCents,
      refundedCents: sales.refundedCents,
      balanceDueCents: sales.balanceDueCents,
      createdAt: sales.createdAt,
      completedAt: sales.completedAt,
      dueOn: sales.dueOn,
      customerId: sales.customerId,
      customerName: sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`,
      branchName: branches.name,
      soldByName: users.name,
      itemCount: sql<number>`(select coalesce(sum(quantity), 0)::int from sale_items si where si.sale_id = ${ref(sales.id)})`,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .innerJoin(branches, eq(branches.id, sales.branchId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, sales.soldByMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(where)
    .orderBy(f.dir === "asc" ? asc(sortCol) : desc(sortCol), desc(sales.number))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

export async function getSale(ctx: Ctx, saleId: string) {
  requireAny(ctx, "sales.view", "orders.view");
  const [row] = await db()
    .select({
      sale: sales,
      branchName: branches.name,
      branchAddress: branches.addressLine1,
      branchCity: branches.city,
      branchPhone: branches.phone,
      customer: customers,
      soldByName: users.name,
      labSupplierName: suppliers.name,
      locationName: inventoryLocations.name,
    })
    .from(sales)
    .innerJoin(branches, eq(branches.id, sales.branchId))
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, sales.locationId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, sales.soldByMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .leftJoin(suppliers, eq(suppliers.id, sales.labSupplierId))
    .where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, saleId)))
    .limit(1);
  if (!row) throw notFound("Sale");
  // Staff who can only see orders (e.g. practitioners) can't open counter sales.
  if (row.sale.kind !== "order" && !can(ctx, "sales.view")) throw notFound("Sale");

  const [items, paymentRows, refundRows, refundLineRows, reservations, history] = await Promise.all([
    db().select().from(saleItems).where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId))).orderBy(asc(saleItems.sortOrder)),
    db()
      .select({ payment: payments, receivedByName: users.name })
      .from(payments)
      .leftJoin(businessMemberships, eq(businessMemberships.id, payments.receivedByMembershipId))
      .leftJoin(users, eq(users.id, businessMemberships.userId))
      .where(and(eq(payments.businessId, ctx.businessId), eq(payments.saleId, saleId)))
      .orderBy(asc(payments.receivedAt)),
    db()
      .select({ refund: refunds, processedByName: users.name })
      .from(refunds)
      .leftJoin(businessMemberships, eq(businessMemberships.id, refunds.processedByMembershipId))
      .leftJoin(users, eq(users.id, businessMemberships.userId))
      .where(and(eq(refunds.businessId, ctx.businessId), eq(refunds.saleId, saleId)))
      .orderBy(asc(refunds.createdAt)),
    db()
      .select({ item: refundItems })
      .from(refundItems)
      .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
      .where(and(eq(refundItems.businessId, ctx.businessId), eq(refunds.saleId, saleId))),
    db().select().from(stockReservations).where(and(eq(stockReservations.businessId, ctx.businessId), eq(stockReservations.saleId, saleId))),
    db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, ctx.businessId), eq(auditLogs.entityType, "sale"), eq(auditLogs.entityId, saleId)))
      .orderBy(asc(auditLogs.createdAt)),
  ]);
  return {
    ...row,
    items,
    payments: paymentRows,
    refunds: refundRows.map((r) => ({ ...r, items: refundLineRows.filter((l) => l.item.refundId === r.refund.id).map((l) => l.item) })),
    reservations,
    history,
    allowedTransitions: row.sale.kind === "order" ? allowedTransitions(row.sale.fulfillmentStatus as FulfillmentStage) : [],
  };
}

export type PaymentFilter = { method?: string | null; from?: Date; to?: Date; q?: string; branchId?: string | null; status?: string | null; page?: number; pageSize?: number };

export async function listPayments(ctx: Ctx, f: PaymentFilter) {
  requirePermission(ctx, "sales.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(payments.businessId, ctx.businessId)];
  if (f.method) conds.push(sql`${payments.method} = ${f.method}`);
  if (f.status) conds.push(sql`${payments.status} = ${f.status}`);
  if (f.from) conds.push(gte(payments.receivedAt, f.from));
  if (f.to) conds.push(lt(payments.receivedAt, f.to));
  if (f.branchId) conds.push(eq(sales.branchId, f.branchId));
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(sql`(${sales.number} ilike ${p} or coalesce(${payments.reference}, '') ilike ${p} or ${customers.firstName} || ' ' || ${customers.lastName} ilike ${p})`);
  }
  const where = and(...conds);
  const rows = await db()
    .select({
      id: payments.id,
      method: payments.method,
      amountCents: payments.amountCents,
      reference: payments.reference,
      status: payments.status,
      receivedAt: payments.receivedAt,
      notes: payments.notes,
      saleId: sales.id,
      saleNumber: sales.number,
      saleKind: sales.kind,
      customerName: sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`,
      receivedByName: users.name,
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, payments.receivedByMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(where)
    .orderBy(desc(payments.receivedAt))
    .limit(pageSize)
    .offset(offset);
  const [totals] = await db()
    .select({
      count: sql<number>`count(*)::int`,
      sum: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'completed'), 0)::bigint`,
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where);
  return { ...pageOf(rows, Number(totals.count), page, pageSize), sumCents: Number(totals.sum) };
}

/** Outstanding balances: receivables on recognised sales, and balances on open orders, kept separate. */
export async function outstandingSummary(ctx: Ctx, branchId?: string | null) {
  requirePermission(ctx, "sales.view");
  const branch = branchId ? sql`and branch_id = ${branchId}` : sql``;
  const res = await db().execute<{ receivable: number; receivable_count: number; open_orders: number; open_order_count: number; overdue: number; overdue_count: number }>(sql`
    select
      coalesce(sum(balance_due_cents) filter (where status = 'completed'), 0)::bigint as receivable,
      count(*) filter (where status = 'completed' and balance_due_cents > 0)::int as receivable_count,
      coalesce(sum(balance_due_cents) filter (where status = 'open'), 0)::bigint as open_orders,
      count(*) filter (where status = 'open' and balance_due_cents > 0)::int as open_order_count,
      coalesce(sum(balance_due_cents) filter (where status = 'completed' and completed_at < now() - interval '14 days'), 0)::bigint as overdue,
      count(*) filter (where status = 'completed' and balance_due_cents > 0 and completed_at < now() - interval '14 days')::int as overdue_count
    from sales
    where business_id = ${ctx.businessId} and balance_due_cents > 0 ${branch}`);
  const r = res.rows[0];
  return {
    receivableCents: Number(r.receivable),
    receivableCount: Number(r.receivable_count),
    openOrderBalanceCents: Number(r.open_orders),
    openOrderCount: Number(r.open_order_count),
    overdueCents: Number(r.overdue),
    overdueCount: Number(r.overdue_count),
  };
}

// ─── Online orders imported from GoHighLevel ─────────────────────────────────

export type OnlineSaleInput = {
  externalOrderId: string;
  externalStatus: string | null;
  branchId: string;
  customerId: string | null;
  lines: { variantId: string; quantity: number; unitPriceCents: number }[];
  /** Successful GHL transactions for the order (amounts in minor units). */
  payments: { reference: string; amountCents: number; receivedAt: Date }[];
  orderedAt: Date;
  notes: string | null;
};

/**
 * Records a PAID GoHighLevel online order as a completed sale, exactly once per GHL order id.
 * - Prices come from the GHL order (what the customer actually paid), tax follows the business setting.
 * - Stock is consumed once, at import (the defined consumption event for online orders), with a
 *   per-line idempotency key. A line with too little stock is still recorded (the money was taken) but
 *   is reported as oversold instead of driving stock negative.
 * - Payments use method "ghl_online" with the GHL transaction id as reference — they were processed by
 *   GHL, unlike manual POS payments.
 */
export async function importOnlineSale(ctx: Ctx, input: OnlineSaleInput): Promise<{ saleId: string; number: string; created: boolean; oversold: string[]; totalCents: number }> {
  requirePermission(ctx, "pos.use");
  const existing = async () => {
    const [s] = await db()
      .select({ saleId: sales.id, number: sales.number, totalCents: sales.totalCents })
      .from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.externalGhlOrderId, input.externalOrderId)))
      .limit(1);
    return s ?? null;
  };
  const prior = await existing();
  if (prior) return { ...prior, created: false, oversold: [] };
  try {
    return await getDb().transaction(async (tx) => {
      const tax = await businessTax(tx, ctx);
      const branch = await activeBranch(tx, ctx, input.branchId);
      const location = await locationForBranch(tx, ctx, branch.id);
      const ids = [...new Set(input.lines.map((l) => l.variantId))];
      const rows = await tx
        .select({ id: productVariants.id, sku: productVariants.sku, label: productVariants.label, costCents: productVariants.costCents, productName: products.name, productType: products.productType, taxExempt: products.taxExempt, categoryId: products.categoryId })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.id, ids)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const pricing: PricingLineInput[] = [];
      const meta: LineMeta[] = [];
      for (const l of input.lines) {
        const v = byId.get(l.variantId);
        if (!v) throw invalid("An online order line points at a product that no longer exists.");
        const id = randomUUID();
        pricing.push({ key: id, quantity: l.quantity, unitPriceCents: l.unitPriceCents, lineDiscountCents: 0, taxExempt: v.taxExempt });
        meta.push({ id, variantId: v.id, productName: v.productName, variantLabel: v.label, sku: v.sku, productType: v.productType, categoryId: v.categoryId, unitCostCents: v.productType === "service" ? 0 : v.costCents, prescriptionId: null, notes: null });
      }
      const priced = price(pricing, tax, null);
      const paid = Math.min(priced.totalCents, input.payments.reduce((s, p) => s + p.amountCents, 0));
      const saleId: string = randomUUID();
      const number = await nextNumber(tx, ctx.businessId, "sale", "S-");
      const at = input.orderedAt;
      await tx.insert(sales).values({
        id: saleId,
        businessId: ctx.businessId,
        number,
        kind: "pos",
        status: "completed",
        fulfillmentStatus: "completed",
        paymentStatus: "unpaid",
        branchId: branch.id,
        locationId: location.id,
        customerId: input.customerId,
        soldByMembershipId: null,
        currency: tax.currency,
        taxRateBps: tax.taxRateBps,
        pricesIncludeTax: tax.pricesIncludeTax,
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        taxCents: priced.taxCents,
        totalCents: priced.totalCents,
        costCents: meta.reduce((s, m, i) => s + m.unitCostCents * priced.lines[i].quantity, 0),
        balanceDueCents: priced.totalCents,
        notes: input.notes,
        idempotencyKey: `ghl-order:${input.externalOrderId}`,
        channel: "ghl_online",
        externalGhlOrderId: input.externalOrderId,
        externalGhlStatus: input.externalStatus,
        createdAt: at,
        completedAt: at,
        updatedAt: new Date(),
      });
      await insertItems(tx, ctx, saleId, meta, priced);

      const oversold: string[] = [];
      const needs = stockNeeds(meta, priced);
      if (needs.size) {
        const balances = await lockBalances(tx, ctx, location.id, [...needs.keys()]);
        for (let i = 0; i < meta.length; i++) {
          const m = meta[i];
          if (m.productType !== "stock") continue;
          const b = balances.get(m.variantId);
          const qty = priced.lines[i].quantity;
          if (!b || b.onHand - b.reserved < qty) {
            oversold.push(`${m.productName} (${m.sku}): ${Math.max(0, b ? b.onHand - b.reserved : 0)} available, ${qty} sold online`);
            continue;
          }
          await applyMovement(tx, ctx, balances, {
            variantId: m.variantId,
            locationId: location.id,
            type: "sale",
            quantity: -qty,
            unitCostCents: m.unitCostCents,
            reason: `Online order ${number} (GoHighLevel)`,
            referenceType: "sale",
            referenceId: saleId,
            referenceLineId: m.id,
            idempotencyKey: `ghl-order:${input.externalOrderId}:${m.id}`,
          });
        }
      }
      let remaining = paid;
      for (const p of input.payments) {
        const amount = Math.min(p.amountCents, remaining);
        if (amount <= 0) break;
        remaining -= amount;
        await tx.insert(payments).values({
          businessId: ctx.businessId,
          saleId,
          method: "ghl_online",
          amountCents: amount,
          reference: p.reference,
          receivedAt: p.receivedAt,
          idempotencyKey: `ghl-order:${input.externalOrderId}:pay:${p.reference}`,
          notes: "Processed by GoHighLevel online checkout",
          createdAt: new Date(),
        });
      }
      await settle(tx, ctx, { id: saleId, totalCents: priced.totalCents, paidCents: paid, refundedCents: 0, refundedCashCents: 0, status: "completed" });
      await audit(tx, ctx, {
        action: "sale.imported",
        entityType: "sale",
        entityId: saleId,
        summary: `Imported GoHighLevel online order ${input.externalOrderId} as ${number}${oversold.length ? ` — ${oversold.length} line(s) oversold` : ""}`,
      });
      return { saleId, number, created: true, oversold, totalCents: priced.totalCents };
    });
  } catch (error) {
    if (isUniqueViolation(error, "sales_ghl_order_key") || isUniqueViolation(error, "sales_idempotency_key")) {
      const again = await existing();
      if (again) return { ...again, created: false, oversold: [] };
    }
    mapDbError(error);
  }
}
