"use client";

import { Banknote, Check, CreditCard, Landmark, Minus, Plus, Printer, Receipt, RotateCcw, Search, Smartphone, Split, Tag, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { newKey, useAction } from "@/components/app/use-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { CountBadge } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { priceSale, PricingError } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import { checkoutAction } from "./actions";

export type PosItem = {
  variantId: string;
  productName: string;
  brand: string | null;
  label: string;
  sku: string;
  barcode: string | null;
  priceCents: number;
  productType: "stock" | "service" | "made_to_order";
  taxExempt: boolean;
  imageUrl: string | null;
  categoryId: string;
  available: number;
};

type Line = { variantId: string; qty: number; customPriceCents: number | null };
type Pay = { method: "cash" | "card" | "bank_transfer" | "gcash" | "maya" | "other"; amountCents: number | null; tenderedCents: number | null; reference: string };

const METHOD_ICON = { cash: Banknote, card: CreditCard, bank_transfer: Landmark, gcash: Smartphone, maya: Wallet, other: Receipt } as const;

export function PosTerminal({
  items,
  categories,
  branchId,
  branches,
  tax,
  money,
  maxDiscountBps,
  canDiscountUnlimited,
  canCreateCustomer,
  initialCustomer,
}: {
  items: PosItem[];
  categories: { id: string; name: string }[];
  branchId: string;
  branches: { id: string; name: string }[];
  tax: { rateBps: number; pricesIncludeTax: boolean; name: string };
  money: { currency: string; locale: string };
  maxDiscountBps: number;
  canDiscountUnlimited: boolean;
  canCreateCustomer: boolean;
  initialCustomer: PickedCustomer | null;
}) {
  const router = useRouter();
  const fmt = (c: number) => formatMoney(c, money.currency, money.locale);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [discount, setDiscount] = useState<{ type: "none" | "percent" | "amount"; value: string }>({ type: "none", value: "" });
  const [payments, setPayments] = useState<Pay[]>([{ method: "cash", amountCents: null, tenderedCents: null, reference: "" }]);
  const [partial, setPartial] = useState(false);
  const [notes, setNotes] = useState("");
  const [cartKey, setCartKey] = useState(newKey());
  const [done, setDone] = useState<{ saleId: string; number: string; totalCents: number; balanceDueCents: number; changeCents: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => (category === "all" || i.categoryId === category) && (!term || `${i.productName} ${i.brand ?? ""} ${i.label} ${i.sku} ${i.barcode ?? ""}`.toLowerCase().includes(term)));
  }, [items, q, category]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1);
    return m;
  }, [items]);

  const qtyInCart = (variantId: string) => lines.filter((l) => l.variantId === variantId).reduce((s, l) => s + l.qty, 0);

  const add = (item: PosItem) => {
    if (item.productType === "stock" && qtyInCart(item.variantId) >= item.available) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === item.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { variantId: item.variantId, qty: 1, customPriceCents: null }];
    });
  };

  const orderDiscount =
    discount.type === "percent" && discount.value
      ? { type: "percent" as const, valueBps: Math.round(Number(discount.value) * 100) }
      : discount.type === "amount" && discount.value
        ? { type: "amount" as const, valueCents: Math.round(Number(discount.value) * 100) }
        : null;

  let priced: ReturnType<typeof priceSale> | null = null;
  let pricingError: string | null = null;
  if (lines.length) {
    try {
      priced = priceSale(
        lines.map((l, i) => {
          const it = byId.get(l.variantId)!;
          return { key: String(i), quantity: l.qty, unitPriceCents: it.productType === "made_to_order" && l.customPriceCents !== null ? l.customPriceCents : it.priceCents, taxExempt: it.taxExempt };
        }),
        { rateBps: tax.rateBps, pricesIncludeTax: tax.pricesIncludeTax },
        orderDiscount,
      );
    } catch (e) {
      pricingError = e instanceof PricingError ? e.message : "Check the discount.";
    }
  }
  const total = priced?.totalCents ?? 0;
  const discountTooHigh = priced && !canDiscountUnlimited && priced.subtotalCents > 0 && priced.discountCents * 10000 > priced.subtotalCents * maxDiscountBps;

  // Single payment defaults to the full total unless the cashier sets a partial amount.
  const effectivePayments = payments.map((p, i) => ({
    ...p,
    amountCents: p.amountCents ?? (payments.length === 1 && !partial ? total : i === 0 ? total - payments.slice(1).reduce((s, x) => s + (x.amountCents ?? 0), 0) : 0),
  }));
  const paid = effectivePayments.reduce((s, p) => s + Math.max(0, p.amountCents ?? 0), 0);
  const balance = total - paid;
  const cash = effectivePayments.find((p) => p.method === "cash");
  const change = cash && cash.tenderedCents !== null && cash.amountCents ? Math.max(0, cash.tenderedCents - cash.amountCents) : 0;
  const problems: string[] = [];
  if (pricingError) problems.push(pricingError);
  if (discountTooHigh) problems.push(`Discounts above ${maxDiscountBps / 100}% need a manager.`);
  if (paid > total) problems.push("Payments exceed the total.");
  if (balance > 0 && !customer) problems.push("Link a customer to leave a balance due.");
  if (cash && cash.tenderedCents !== null && cash.amountCents && cash.tenderedCents < cash.amountCents) problems.push("Cash tendered is less than the cash amount.");

  const act = useAction(checkoutAction, {
    silent: true,
    onSuccess: (r) => {
      setDone({ ...r, changeCents: change });
    },
  });

  const reset = () => {
    setLines([]);
    setCustomer(null);
    setDiscount({ type: "none", value: "" });
    setPayments([{ method: "cash", amountCents: null, tenderedCents: null, reference: "" }]);
    setPartial(false);
    setNotes("");
    setCartKey(newKey());
    setDone(null);
    act.reset();
    searchRef.current?.focus();
  };

  const submit = () =>
    act.run({
      branchId,
      customerId: customer?.id ?? null,
      items: lines.map((l) => {
        const it = byId.get(l.variantId)!;
        return { variantId: l.variantId, quantity: l.qty, lineDiscountCents: 0, unitPriceCents: it.productType === "made_to_order" ? l.customPriceCents : null };
      }),
      orderDiscount,
      payments: effectivePayments.filter((p) => (p.amountCents ?? 0) > 0).map((p) => ({ method: p.method, amountCents: p.amountCents!, tenderedCents: p.method === "cash" ? p.tenderedCents : null, reference: p.reference || null })),
      notes,
      idempotencyKey: cartKey,
    });

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-150px)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* Catalogue */}
      <section aria-label="Products" className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
            <Input
              ref={searchRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const term = q.trim().toLowerCase();
                const exact = items.find((i) => i.barcode === q.trim() || i.sku.toLowerCase() === term);
                const target = exact ?? (visible.length === 1 ? visible[0] : null);
                if (target) {
                  add(target);
                  setQ("");
                }
              }}
              placeholder="Search or scan barcode / SKU, then Enter"
              aria-label="Search products"
              className="h-10 pl-9"
            />
          </div>
          {branches.length > 1 ? (
            <Select aria-label="Branch" value={branchId} onChange={(e) => router.push(`/app/pos?branch=${e.target.value}`)} className="h-10 w-auto font-medium sm:w-48">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <div className="scroll-thin flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
          {[{ id: "all", name: "All products" }, ...categories].map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", active ? "bg-ink text-white" : "text-text-2 hover:bg-muted-soft hover:text-text")}
              >
                {c.name}
                <CountBadge active={active}>{c.id === "all" ? items.length : counts.get(c.id) ?? 0}</CountBadge>
              </button>
            );
          })}
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-line-strong p-10 text-center text-[13px] text-text-3">No products match “{q}”.</div>
        ) : (
          <ul className="scroll-thin grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto pr-1 max-lg:max-h-[58vh] md:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => {
              const inCart = qtyInCart(item.variantId);
              const out = item.productType === "stock" && item.available - inCart <= 0;
              const stockLabel = item.productType === "stock" ? `${Math.max(0, item.available - inCart)} in stock` : item.productType === "service" ? "Service" : "Made to order";
              return (
                <li key={item.variantId}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    disabled={out && item.productType === "stock"}
                    className={cn(
                      "group flex h-full w-full flex-col overflow-hidden rounded-[14px] border bg-surface text-left transition-colors",
                      inCart ? "border-ink" : "border-line hover:border-line-strong",
                      out && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <span className="relative block aspect-[16/11] bg-[#efeee8]">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                      <span className={cn("absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", out ? "bg-neg text-white" : "bg-ink text-white")}>{out ? "Out of stock" : stockLabel}</span>
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 p-3">
                      <span className="line-clamp-1 text-[13px] font-semibold">{item.productName}</span>
                      <span className="line-clamp-1 text-[12px] text-text-3">{item.label !== "Default" ? item.label : item.brand ?? item.sku}</span>
                      <span className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-[14px] font-semibold tabular">{fmt(item.priceCents)}</span>
                        <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium", inCart ? "bg-ink text-white" : "border border-line-strong text-text-2 group-hover:border-text-3")}>
                          {inCart ? (
                            <>
                              <Check className="size-3.5" /> {inCart}
                              <span className="sr-only"> in sale</span>
                            </>
                          ) : (
                            <>
                              <Plus className="size-3.5" /> Add
                            </>
                          )}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Transaction panel */}
      {/* Phones/tablets: the cart sits below the catalogue, so keep a shortcut to it in view. */}
      {lines.length ? (
        <a
          href="#current-sale"
          className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-full bg-ink px-5 py-3 text-[13.5px] font-medium text-white shadow-[var(--shadow-pop)] lg:hidden"
        >
          <span>
            Current sale · {lines.reduce((n, l) => n + l.qty, 0)} item{lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"}
          </span>
          <span className="tabular">{fmt(total)} · Review</span>
        </a>
      ) : null}
      <aside id="current-sale" aria-label="Current sale" className="flex min-h-0 scroll-mt-4 flex-col rounded-[16px] border border-line bg-surface-2">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">Current sale</h2>
          {lines.length ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-neg hover:underline">
              <RotateCcw className="size-3.5" /> Clear
            </button>
          ) : null}
        </div>
        <div className="px-4 pb-3">
          <CustomerPicker value={customer} onChange={setCustomer} branches={branches} canCreate={canCreateCustomer} compact />
        </div>
        <div className="scroll-thin min-h-[120px] flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-text-3">Tap a product or scan a barcode to start.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((l, i) => {
                const it = byId.get(l.variantId)!;
                const unit = it.productType === "made_to_order" && l.customPriceCents !== null ? l.customPriceCents : it.priceCents;
                const max = it.productType === "stock" ? it.available : 99;
                return (
                  <li key={l.variantId} className="rounded-[12px] border border-line bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <span className="size-10 shrink-0 overflow-hidden rounded-[8px] bg-[#efeee8]">
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
                      <button type="button" aria-label={`Remove ${it.productName}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-full text-neg hover:bg-neg-soft">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button type="button" aria-label="Decrease quantity" onClick={() => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="flex size-7 items-center justify-center rounded-full border border-line-strong hover:bg-muted-soft">
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-7 text-center text-[13px] font-semibold tabular" aria-label="Quantity">
                          {String(l.qty).padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={l.qty >= max}
                          onClick={() => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: Math.min(max, x.qty + 1) } : x)))}
                          className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-ink hover:brightness-95 disabled:opacity-40"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      {it.productType === "made_to_order" ? (
                        <MoneyInput aria-label="Price for this job" value={unit} onValueChange={(c) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, customPriceCents: c } : x)))} className="w-32" />
                      ) : (
                        <span className="text-[13px] font-semibold tabular">{fmt(unit * l.qty)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Tag className="size-4 shrink-0 text-text-3" aria-hidden="true" />
            <Select aria-label="Discount type" value={discount.type} onChange={(e) => setDiscount({ type: e.target.value as "none", value: "" })} className="h-8 w-auto text-[12.5px]">
              <option value="none">No discount</option>
              <option value="percent">% off</option>
              <option value="amount">Amount off</option>
            </Select>
            {discount.type !== "none" ? (
              <>
                <Input aria-label="Discount value" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} className="h-8 w-24 text-right" placeholder={discount.type === "percent" ? "e.g. 20" : "0.00"} />
                {discount.type === "percent" ? (
                  <button type="button" className="text-[12px] text-text-2 underline-offset-2 hover:underline" onClick={() => setDiscount({ type: "percent", value: "20" })}>
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
                <dt>Discount</dt>
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
              <dd className="font-display text-[22px] font-semibold tabular">{fmt(total)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            {payments.map((p, i) => {
              const Icon = METHOD_ICON[p.method];
              const eff = effectivePayments[i];
              return (
                <div key={i} className="rounded-[12px] border border-line bg-surface p-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-text-3" aria-hidden="true" />
                    <Select aria-label="Payment method" value={p.method} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, method: e.target.value as Pay["method"] } : x)))} className="h-8 flex-1 text-[12.5px]">
                      {(["cash", "card", "gcash", "maya", "bank_transfer", "other"] as const).map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </Select>
                    {payments.length > 1 || partial ? (
                      <MoneyInput aria-label="Amount" value={p.amountCents ?? eff.amountCents} onValueChange={(c) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, amountCents: c } : x)))} className="w-32" />
                    ) : (
                      <span className="w-32 text-right text-[13px] font-semibold tabular">{fmt(eff.amountCents ?? 0)}</span>
                    )}
                    {payments.length > 1 ? (
                      <button type="button" aria-label="Remove payment" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} className="text-text-3 hover:text-text">
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  {p.method === "cash" ? (
                    <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-text-2">
                      <span>Cash received</span>
                      <MoneyInput aria-label="Cash tendered" value={p.tenderedCents} onValueChange={(c) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, tenderedCents: c } : x)))} className="w-32" placeholder="optional" />
                    </div>
                  ) : (
                    <Input aria-label="Reference number" value={p.reference} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} placeholder={p.method === "card" ? "Approval code (from terminal)" : "Reference number"} className="mt-2 h-8 text-[12.5px]" />
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              {payments.length < 3 ? (
                <button type="button" onClick={() => setPayments((ps) => [...ps.map((x, j) => (j === 0 && x.amountCents === null ? { ...x, amountCents: effectivePayments[0].amountCents } : x)), { method: "gcash", amountCents: 0, tenderedCents: null, reference: "" }])} className="inline-flex items-center gap-1 font-medium text-text-2 hover:text-text">
                  <Split className="size-3.5" /> Split payment
                </button>
              ) : null}
              <label className="inline-flex items-center gap-1.5 font-medium text-text-2">
                <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="size-3.5 accent-[var(--ink)]" />
                Partial payment
              </label>
            </div>
            <p className="text-[11.5px] text-text-3">Card, GCash, Maya and bank payments are confirmed on the external terminal or app and recorded here — no gateway is connected.</p>
          </div>

          {balance > 0 && total > 0 ? <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Balance due after this sale: {fmt(balance)}</p> : null}
          {change > 0 ? <p className="rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] font-medium">Change due: {fmt(change)}</p> : null}
          {problems.length && lines.length ? <p className="text-[12.5px] text-neg">{problems[0]}</p> : null}
          {act.error ? <p className="text-[12.5px] text-neg" role="alert">{act.error}</p> : null}
          <Button variant="accent" size="lg" className="w-full justify-center rounded-full" disabled={!lines.length || problems.length > 0} loading={act.pending} onClick={submit}>
            Complete sale · {fmt(total)}
          </Button>
        </div>
      </aside>

      <DialogRoot open={Boolean(done)} onOpenChange={(o) => !o && reset()}>
        {done ? (
          <DialogContent size="sm" title={`Sale ${done.number} completed`} description="Stock, payments and the customer's history have been updated.">
            <div className="flex flex-col items-center gap-1 py-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check className="size-6" />
              </span>
              <p className="mt-2 font-display text-[28px] font-semibold tabular">{fmt(done.totalCents)}</p>
              {done.changeCents > 0 ? <p className="text-[14px] font-medium">Change due: {fmt(done.changeCents)}</p> : null}
              {done.balanceDueCents > 0 ? <p className="text-[13px] text-warn">Balance due: {fmt(done.balanceDueCents)}</p> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ButtonLink href={`/print/receipt/${done.saleId}`} target="_blank" className="justify-center">
                <Printer /> Receipt
              </ButtonLink>
              <Button variant="primary" className="justify-center" onClick={reset}>
                New sale
              </Button>
            </div>
            <Link href={`/app/sales/${done.saleId}`} className="mt-3 block text-center text-[12.5px] text-text-2 hover:text-text">
              View transaction details
            </Link>
          </DialogContent>
        ) : null}
      </DialogRoot>
    </div>
  );
}
