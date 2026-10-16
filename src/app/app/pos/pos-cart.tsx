"use client";

import { ArrowLeft, Banknote, CircleCheck, CreditCard, Landmark, Minus, MoreHorizontal, PauseCircle, Percent, Plus, Receipt, RotateCcw, Smartphone, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import type { posCustomerContextAction } from "./actions";
import type { PosItem } from "./terminal";

export type LineDiscount = { type: "amount"; cents: number } | { type: "percent"; bps: number };
export type Line = { variantId: string; qty: number; customPriceCents: number | null; discount: LineDiscount | null };
export type PayMethod = "cash" | "card" | "bank_transfer" | "gcash" | "maya" | "other";
export type Pay = { method: PayMethod; amountCents: number; tenderedCents: number | null; reference: string };
export type CustomerContext = Extract<Awaited<ReturnType<typeof posCustomerContextAction>>, { ok: true }>["data"];
export type Priced = { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; lines: { lineTotalCents: number; discountCents: number }[] };

export const METHOD_ICON = { cash: Banknote, card: CreditCard, bank_transfer: Landmark, gcash: Smartphone, maya: Wallet, other: Receipt } as const;
export const METHODS: PayMethod[] = ["cash", "card", "gcash", "maya", "bank_transfer", "other"];

/** Line discount in cents for a gross line amount (clamped to the line). */
export function lineDiscountCents(d: LineDiscount | null, grossCents: number) {
  if (!d) return 0;
  const raw = d.type === "amount" ? d.cents : Math.round((grossCents * d.bps) / 10000);
  return Math.max(0, Math.min(grossCents, raw));
}

// ─── Cart ────────────────────────────────────────────────────────────────────

export function CartPanel({
  lines,
  byId,
  priced,
  fmt,
  customer,
  setCustomer,
  customerInfo,
  branches,
  canCreateCustomer,
  orderDiscount,
  setOrderDiscount,
  tax,
  onQty,
  onRemove,
  onCustomPrice,
  onLineDiscount,
  onClear,
  onHold,
  onCharge,
  chargeLabel,
  canCharge,
  status,
  problem,
  locale,
}: {
  lines: Line[];
  byId: Map<string, PosItem>;
  priced: Priced | null;
  fmt: (c: number) => string;
  customer: PickedCustomer | null;
  setCustomer: (c: PickedCustomer | null) => void;
  customerInfo: CustomerContext | null;
  branches: { id: string; name: string }[];
  canCreateCustomer: boolean;
  orderDiscount: { type: "none" | "percent" | "amount"; value: string };
  setOrderDiscount: (d: { type: "none" | "percent" | "amount"; value: string }) => void;
  tax: { rateBps: number; pricesIncludeTax: boolean; name: string };
  onQty: (i: number, qty: number) => void;
  onRemove: (i: number) => void;
  onCustomPrice: (i: number, cents: number | null) => void;
  onLineDiscount: (i: number, d: LineDiscount | null) => void;
  onClear: () => void;
  onHold: () => void;
  onCharge: () => void;
  chargeLabel: string;
  canCharge: boolean;
  status: ReactNode;
  problem: string | null;
  locale: string;
}) {
  const [discountLine, setDiscountLine] = useState<number | null>(null);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold">Current sale</h2>
          <p className="text-[12px] text-text-3">{itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "No items yet"}</p>
        </div>
        {lines.length ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onHold} aria-keyshortcuts="F8">
              <PauseCircle /> Hold
            </Button>
            <Button size="sm" variant="ghost" className="text-neg hover:text-neg" onClick={onClear}>
              <RotateCcw /> Clear
            </Button>
          </div>
        ) : null}
      </div>
      <div className="px-4 pb-3">
        <CustomerPicker value={customer} onChange={setCustomer} branches={branches} canCreate={canCreateCustomer} compact />
        {customer && customerInfo && customerInfo.visits !== null ? (
          <div className="mt-2 flex flex-col gap-0.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-text-2">
            <p>
              {customerInfo.visits ? `Returning customer · ${customerInfo.visits} purchase${customerInfo.visits === 1 ? "" : "s"}` : "First purchase"}
              {customerInfo.lastPurchaseAt ? ` · last ${new Date(customerInfo.lastPurchaseAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </p>
            {customerInfo.outstanding && customerInfo.outstanding.count > 0 ? (
              <p className="font-medium text-warn">
                Owes {fmt(customerInfo.outstanding.totalCents)} on {customerInfo.outstanding.count} earlier sale{customerInfo.outstanding.count === 1 ? "" : "s"} ·{" "}
                <Link href={`/app/customers/${customer.id}`} className="underline-offset-2 hover:underline">
                  View
                </Link>
              </p>
            ) : null}
            {customerInfo.recentItems.length ? (
              <p className="truncate text-text-3" title={customerInfo.recentItems.map((i) => i.productName).join(", ")}>
                Recently: {[...new Set(customerInfo.recentItems.map((i) => (i.variantLabel && i.variantLabel !== "Default" ? `${i.productName} (${i.variantLabel})` : i.productName)))].join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="scroll-thin min-h-[120px] flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-text-3">Tap a product or scan a barcode to start.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Items in this sale">
            {lines.map((l, i) => {
              const it = byId.get(l.variantId)!;
              const unit = it.productType === "made_to_order" && l.customPriceCents !== null ? l.customPriceCents : it.priceCents;
              const max = it.productType === "stock" ? it.available : 99;
              const pl = priced?.lines[i];
              return (
                <li key={l.variantId} className="rounded-[12px] border border-line bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <span className="size-11 shrink-0 overflow-hidden rounded-[8px] bg-[#efeee8]">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{it.productName}</p>
                      <p className="truncate text-[11.5px] text-text-3">
                        {it.label !== "Default" ? `${it.label} · ` : ""}
                        {it.sku}
                      </p>
                    </div>
                    <Menu>
                      <MenuTrigger className="flex size-7 items-center justify-center rounded-full text-text-3 hover:bg-muted-soft hover:text-text" aria-label={`More for ${it.productName}`}>
                        <MoreHorizontal className="size-4" />
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => setDiscountLine(i)}>
                          <Percent /> {l.discount ? "Change line discount" : "Discount this line"}
                        </MenuItem>
                        <MenuItem onSelect={() => onRemove(i)} destructive>
                          <Trash2 /> Remove
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Decrease quantity" onClick={() => (l.qty > 1 ? onQty(i, l.qty - 1) : onRemove(i))} className="flex size-7 items-center justify-center rounded-full border border-line-strong hover:bg-muted-soft">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-[13px] font-semibold tabular" aria-label="Quantity">
                        {String(l.qty).padStart(2, "0")}
                      </span>
                      <button type="button" aria-label="Increase quantity" disabled={l.qty >= max} onClick={() => onQty(i, Math.min(max, l.qty + 1))} className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-ink hover:brightness-95 disabled:opacity-40">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    {it.productType === "made_to_order" ? (
                      <MoneyInput aria-label="Price for this job" value={unit} onValueChange={(c) => onCustomPrice(i, c)} className="w-32" />
                    ) : (
                      <span className="text-right">
                        {pl?.discountCents ? <span className="block text-[11.5px] text-text-3 line-through tabular">{fmt(unit * l.qty)}</span> : null}
                        <span className="text-[13px] font-semibold tabular">{fmt(pl?.lineTotalCents ?? unit * l.qty)}</span>
                      </span>
                    )}
                  </div>
                  {l.discount ? (
                    <button type="button" onClick={() => setDiscountLine(i)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-neg-soft px-2 py-0.5 text-[11.5px] font-medium text-neg">
                      {l.discount.type === "percent" ? `${l.discount.bps / 100}% off` : `${fmt(l.discount.cents)} off`}
                      {pl?.discountCents ? ` · −${fmt(pl.discountCents)}` : ""}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Order discount" value={orderDiscount.type} onChange={(e) => setOrderDiscount({ type: e.target.value as "none", value: "" })} className="h-8 w-auto text-[12.5px]">
            <option value="none">No order discount</option>
            <option value="percent">% off order</option>
            <option value="amount">Amount off order</option>
          </Select>
          {orderDiscount.type !== "none" ? (
            <>
              <Input aria-label="Order discount value" inputMode="decimal" value={orderDiscount.value} onChange={(e) => setOrderDiscount({ ...orderDiscount, value: e.target.value })} className="h-8 w-24 text-right" placeholder={orderDiscount.type === "percent" ? "e.g. 20" : "0.00"} />
              {orderDiscount.type === "percent" ? (
                <button type="button" className="text-[12px] text-text-2 underline-offset-2 hover:underline" onClick={() => setOrderDiscount({ type: "percent", value: "20" })}>
                  Senior / PWD 20%
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <dl className="flex flex-col gap-1 text-[13px]">
          <div className="flex justify-between text-text-2">
            <dt>Subtotal</dt>
            <dd className="tabular">{fmt(priced?.subtotalCents ?? 0)}</dd>
          </div>
          {priced?.discountCents ? (
            <div className="flex justify-between text-neg">
              <dt>Discounts</dt>
              <dd className="tabular">−{fmt(priced.discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-text-2">
            <dt>
              {tax.name} {tax.rateBps / 100}% {tax.pricesIncludeTax ? "(included)" : ""}
            </dt>
            <dd className="tabular">{fmt(priced?.taxCents ?? 0)}</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
            <dt className="text-[14px] font-semibold">Total</dt>
            <dd className="font-display text-[22px] font-semibold tabular">{fmt(priced?.totalCents ?? 0)}</dd>
          </div>
          {lines.length ? (
            <div className="text-[11.5px]" aria-live="polite">
              {status}
            </div>
          ) : null}
        </dl>
        {problem && lines.length ? <p className="text-[12.5px] text-neg">{problem}</p> : null}
        <Button variant="accent" size="lg" className="w-full justify-center rounded-full" disabled={!canCharge} onClick={onCharge} aria-keyshortcuts="Control+Enter">
          {chargeLabel}
        </Button>
      </div>

      <LineDiscountDialog
        open={discountLine !== null}
        onOpenChange={(o) => !o && setDiscountLine(null)}
        title={discountLine !== null && lines[discountLine] ? byId.get(lines[discountLine].variantId)?.productName ?? "Line" : "Line"}
        current={discountLine !== null ? lines[discountLine]?.discount ?? null : null}
        onSave={(d) => {
          if (discountLine !== null) onLineDiscount(discountLine, d);
          setDiscountLine(null);
        }}
      />
    </>
  );
}

function LineDiscountDialog({ open, onOpenChange, title, current, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; current: LineDiscount | null; onSave: (d: LineDiscount | null) => void }) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      {open ? <LineDiscountContent title={title} current={current} onSave={onSave} onCancel={() => onOpenChange(false)} /> : null}
    </DialogRoot>
  );
}

function LineDiscountContent({ title, current, onSave, onCancel }: { title: string; current: LineDiscount | null; onSave: (d: LineDiscount | null) => void; onCancel: () => void }) {
  const [type, setType] = useState<"percent" | "amount">(current?.type ?? "percent");
  const [value, setValue] = useState(current ? (current.type === "percent" ? String(current.bps / 100) : String(current.cents / 100)) : "");
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0 && (type === "amount" || n <= 100);
  const save = () => onSave(type === "percent" ? { type, bps: Math.round(n * 100) } : { type, cents: Math.round(n * 100) });
  return (
    <DialogContent
      size="sm"
      title={`Discount: ${title}`}
      description="Applies to this line only. Discounts above your limit are refused at checkout unless a manager rings up the sale."
      footer={
        <>
          {current ? (
            <Button variant="ghost" className="mr-auto text-neg" onClick={() => onSave(null)}>
              Remove discount
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            Apply
          </Button>
        </>
      }
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
      >
        <Select aria-label="Discount type" value={type} onChange={(e) => setType(e.target.value as "percent" | "amount")} className="w-36">
          <option value="percent">Percent off</option>
          <option value="amount">Amount off</option>
        </Select>
        <Input aria-label="Discount value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percent" ? "e.g. 10" : "0.00"} className="flex-1 text-right" autoFocus />
      </form>
    </DialogContent>
  );
}

// ─── Payment ─────────────────────────────────────────────────────────────────

/** Quick cash amounts: exact, then the next round notes above the amount due. */
function quickCash(dueCents: number) {
  const out = new Set<number>([dueCents]);
  for (const step of [10000, 50000, 100000]) out.add(Math.ceil(dueCents / step) * step);
  return [...out].filter((v) => v >= dueCents).sort((a, b) => a - b).slice(0, 4);
}

export function PaymentPanel({
  totalCents,
  payments,
  setPayments,
  fmt,
  customer,
  onBack,
  onComplete,
  pending,
  problem,
  error,
}: {
  totalCents: number;
  payments: Pay[];
  setPayments: (p: Pay[]) => void;
  fmt: (c: number) => string;
  customer: PickedCustomer | null;
  onBack: () => void;
  onComplete: () => void;
  pending: boolean;
  problem: string | null;
  error: string | null;
}) {
  const paid = payments.reduce((s, p) => s + Math.max(0, p.amountCents), 0);
  const remaining = totalCents - paid;
  const change = payments.reduce((s, p) => s + (p.method === "cash" && p.tenderedCents !== null ? Math.max(0, p.tenderedCents - p.amountCents) : 0), 0);
  const update = (i: number, patch: Partial<Pay>) => setPayments(payments.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addMethod = (method: PayMethod) => {
    if (payments.length === 1 && paid === totalCents && payments[0].tenderedCents === null && !payments[0].reference) {
      // A single untouched payment: switching method rather than splitting.
      setPayments([{ ...payments[0], method }]);
      return;
    }
    if (payments.length >= 4) return;
    setPayments([...payments, { method, amountCents: Math.max(0, remaining), tenderedCents: null, reference: "" }]);
  };
  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back to cart">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Payment</h2>
          <p className="text-[12px] text-text-3">Total due {fmt(totalCents)}</p>
        </div>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Add a payment method">
          {METHODS.map((m) => {
            const Icon = METHOD_ICON[m];
            const selected = payments.length === 1 && payments[0].method === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => addMethod(m)}
                aria-pressed={selected}
                className={cn("flex h-14 flex-col items-center justify-center gap-1 rounded-[12px] border text-[12px] font-medium", selected ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-line-strong")}
              >
                <Icon className="size-4" aria-hidden="true" />
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            );
          })}
        </div>
        <p className="text-[11.5px] text-text-3">Tap a method to use it; once an amount is entered, another method adds a split payment.</p>

        <ul className="flex flex-col gap-2" aria-label="Payments">
          {payments.map((p, i) => {
            const Icon = METHOD_ICON[p.method];
            return (
              <li key={i} className="rounded-[12px] border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-text-3" aria-hidden="true" />
                  <span className="flex-1 text-[13px] font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                  <MoneyInput aria-label={`${PAYMENT_METHOD_LABELS[p.method]} amount`} value={p.amountCents} onValueChange={(c) => update(i, { amountCents: c ?? 0 })} className="w-32" />
                  {payments.length > 1 ? (
                    <button type="button" aria-label={`Remove ${PAYMENT_METHOD_LABELS[p.method]} payment`} onClick={() => setPayments(payments.filter((_, j) => j !== i))} className="text-text-3 hover:text-text">
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                {p.method === "cash" ? (
                  <div className="mt-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-[12.5px] text-text-2">
                      <span>Cash received</span>
                      <MoneyInput aria-label="Cash tendered" value={p.tenderedCents} onValueChange={(c) => update(i, { tenderedCents: c })} className="w-32" placeholder="optional" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {quickCash(p.amountCents).map((v) => (
                        <button key={v} type="button" onClick={() => update(i, { tenderedCents: v })} className={cn("h-7 rounded-full border px-2.5 text-[12px] font-medium tabular", p.tenderedCents === v ? "border-ink bg-ink text-white" : "border-line-strong text-text-2 hover:text-text")}>
                          {v === p.amountCents ? "Exact" : fmt(v)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <Input aria-label={`${PAYMENT_METHOD_LABELS[p.method]} reference`} value={p.reference} onChange={(e) => update(i, { reference: e.target.value })} placeholder={p.method === "card" ? "Approval code (from the terminal)" : "Reference number"} className="mt-2.5 h-8 text-[12.5px]" />
                    <p className="mt-1.5 text-[11px] text-text-3">Recorded manually: confirm it on the {p.method === "card" ? "card terminal" : p.method === "bank_transfer" ? "bank app" : "e-wallet app"} first. Not electronically verified.</p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
        <dl className="flex flex-col gap-1 text-[13px]">
          <div className="flex justify-between text-text-2">
            <dt>Total</dt>
            <dd className="tabular">{fmt(totalCents)}</dd>
          </div>
          <div className="flex justify-between text-text-2">
            <dt>Paid now</dt>
            <dd className="tabular">{fmt(paid)}</dd>
          </div>
          {remaining > 0 ? (
            <div className="flex justify-between font-medium text-warn">
              <dt>Balance due{customer ? ` (${customer.name})` : ""}</dt>
              <dd className="tabular">{fmt(remaining)}</dd>
            </div>
          ) : null}
          {change > 0 ? (
            <div className="flex justify-between rounded-[10px] bg-accent-soft px-2.5 py-1.5 font-semibold">
              <dt>Change due</dt>
              <dd className="tabular">{fmt(change)}</dd>
            </div>
          ) : null}
        </dl>
        {problem ? <p className="text-[12.5px] text-neg">{problem}</p> : null}
        {error ? (
          <p className="text-[12.5px] text-neg" role="alert">
            {error} The cart is unchanged; you can try again.
          </p>
        ) : null}
        <Button variant="accent" size="lg" className="w-full justify-center rounded-full" disabled={Boolean(problem) || pending} loading={pending} onClick={onComplete} aria-keyshortcuts="Control+Enter">
          {remaining > 0 ? `Complete with ${fmt(remaining)} due` : `Complete sale · ${fmt(totalCents)}`}
        </Button>
      </div>
    </>
  );
}

export function CheckedLine({ confirmed, checking }: { confirmed: boolean; checking: boolean }) {
  if (confirmed)
    return (
      <span className="inline-flex items-center gap-1 text-pos">
        <CircleCheck className="size-3.5" aria-hidden="true" /> Prices and stock checked by the server
      </span>
    );
  return checking ? <span className="text-text-3">Checking prices and stock…</span> : null;
}
