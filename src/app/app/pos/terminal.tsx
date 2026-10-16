"use client";

import { Banknote, Check, CircleCheck, CreditCard, Download, Landmark, Minus, PauseCircle, Plus, Printer, Receipt, RotateCcw, Search, Smartphone, Split, Tag, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { newKey, useAction } from "@/components/app/use-action";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { CountBadge } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { priceSale, PricingError } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import { checkoutAction, listHeldCartsAction, posCustomerContextAction, posLookupAction, quoteCartAction } from "./actions";
import { HeldCartsDialog, HoldCartDialog, InsightsDialog, type ResumedCart } from "./pos-dialogs";

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
  reorderPoint: number;
};

type Line = { variantId: string; qty: number; customPriceCents: number | null };
type Pay = { method: "cash" | "card" | "bank_transfer" | "gcash" | "maya" | "other"; amountCents: number | null; tenderedCents: number | null; reference: string };
type QuoteResult = Awaited<ReturnType<typeof quoteCartAction>>;
type CustomerContext = Extract<Awaited<ReturnType<typeof posCustomerContextAction>>, { ok: true }>["data"];

const METHOD_ICON = { cash: Banknote, card: CreditCard, bank_transfer: Landmark, gcash: Smartphone, maya: Wallet, other: Receipt } as const;
const RECENT_MAX = 8;

// Recently added products live in localStorage (per branch, per browser), read as an external store.
const recentListeners = new Set<() => void>();
function subscribeRecent(cb: () => void) {
  recentListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    recentListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readRecentRaw(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]"; // Private mode or storage blocked: recent items just aren't remembered.
  }
}
function parseRecent(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

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
  const [inStockOnly, setInStockOnly] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [discount, setDiscount] = useState<{ type: "none" | "percent" | "amount"; value: string }>({ type: "none", value: "" });
  const [payments, setPayments] = useState<Pay[]>([{ method: "cash", amountCents: null, tenderedCents: null, reference: "" }]);
  const [partial, setPartial] = useState(false);
  const [notes, setNotes] = useState("");
  const [cartKey, setCartKey] = useState(newKey());
  const [attempt, setAttempt] = useState<{ fingerprint: string } | null>(null);
  const [done, setDone] = useState<{ saleId: string; number: string; totalCents: number; balanceDueCents: number; changeCents: number } | null>(null);
  // Items found by an exact SKU/barcode lookup that weren't among those loaded on screen.
  const [extraItems, setExtraItems] = useState<PosItem[]>([]);
  const [quote, setQuote] = useState<{ key: string; result: QuoteResult } | null>(null);
  const [customerCtx, setCustomerCtx] = useState<{ id: string; data: CustomerContext } | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [holdOpen, setHoldOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shortcuts = useRef<{ submit: () => void; hold: () => void }>({ submit: () => {}, hold: () => {} });
  const recentKey = `pos:recent:${branchId}`;
  const recentRaw = useSyncExternalStore(subscribeRecent, () => readRecentRaw(recentKey), () => "[]");
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);

  const allItems = useMemo(() => {
    const known = new Set(items.map((i) => i.variantId));
    return [...items, ...extraItems.filter((i) => !known.has(i.variantId))];
  }, [items, extraItems]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.variantId, i])), [allItems]);

  useEffect(() => {
    listHeldCartsAction(branchId)
      .then((r) => r.ok && setHeldCount(r.data.length))
      .catch(() => undefined);
  }, [branchId]);

  const qtyInCart = (variantId: string) => lines.filter((l) => l.variantId === variantId).reduce((s, l) => s + l.qty, 0);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allItems.filter(
      (i) =>
        (category === "all" || i.categoryId === category) &&
        (!inStockOnly || i.productType !== "stock" || i.available > 0) &&
        (!term || `${i.productName} ${i.brand ?? ""} ${i.label} ${i.sku} ${i.barcode ?? ""}`.toLowerCase().includes(term)),
    );
  }, [allItems, q, category, inStockOnly]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of allItems) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1);
    return m;
  }, [allItems]);

  const recentItems = recent.map((id) => byId.get(id)).filter((i): i is PosItem => Boolean(i));

  const remember = (variantId: string) => {
    const next = [variantId, ...recent.filter((x) => x !== variantId)].slice(0, RECENT_MAX);
    try {
      window.localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      return; // Private mode or storage blocked: recent items just aren't remembered.
    }
    recentListeners.forEach((cb) => cb());
  };

  const add = (item: PosItem) => {
    if (item.productType === "stock" && qtyInCart(item.variantId) >= item.available) {
      toast.error(`No more ${item.productName} in stock at this branch.`);
      return false;
    }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === item.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { variantId: item.variantId, qty: 1, customPriceCents: null }];
    });
    remember(item.variantId);
    return true;
  };

  const addById = (variantId: string) => {
    const item = byId.get(variantId);
    if (!item) {
      toast.error("That product isn't available at this branch.");
      return false;
    }
    return add(item);
  };

  const scan = async () => {
    const raw = q.trim();
    const term = raw.toLowerCase();
    if (!term) return;
    const exact = allItems.find((i) => i.barcode === raw || i.sku.toLowerCase() === term);
    const target = exact ?? (visible.length === 1 ? visible[0] : null);
    if (target) {
      if (add(target)) setQ("");
      return;
    }
    if (visible.length || /\s/.test(raw)) return;
    // Not on screen: ask the server for an exact SKU/barcode match (large catalogues load partially).
    const r = await posLookupAction(branchId, raw).catch(() => null);
    if (r?.ok && r.data) {
      const found = r.data;
      setExtraItems((xs) => [...xs.filter((x) => x.variantId !== found.variantId), found]);
      if (add(found)) setQ("");
    } else {
      toast.error(`No product with SKU or barcode “${raw}”.`);
    }
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

  const saleItems = lines.map((l) => {
    const it = byId.get(l.variantId)!;
    return { variantId: l.variantId, quantity: l.qty, lineDiscountCents: 0, unitPriceCents: it.productType === "made_to_order" ? l.customPriceCents : null };
  });

  // The server re-prices the cart and checks stock as it changes, so the cashier sees the totals
  // checkout will use (and any stock that sold elsewhere) before taking payment.
  const quoteKey = lines.length && !pricingError ? JSON.stringify({ branchId, customerId: customer?.id ?? null, items: saleItems, orderDiscount }) : "";
  useEffect(() => {
    if (!quoteKey) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: QuoteResult;
      try {
        result = await quoteCartAction(JSON.parse(quoteKey));
      } catch {
        result = { ok: false, error: "Couldn't reach the server to check this sale." };
      }
      if (!cancelled) setQuote({ key: quoteKey, result });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteKey]);
  const checked = quote && quote.key === quoteKey ? quote.result : null;

  useEffect(() => {
    const id = customer?.id;
    if (!id) return;
    let cancelled = false;
    posCustomerContextAction(id)
      .then((r) => !cancelled && r.ok && setCustomerCtx({ id, data: r.data }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);
  const custInfo = customer && customerCtx?.id === customer.id ? customerCtx.data : null;

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
  if (checked && !checked.ok) problems.push(checked.error);
  if (checked?.ok) {
    problems.push(...checked.data.problems.filter((p) => !discountTooHigh || !p.startsWith("Discounts above")));
    if (checked.data.totalCents !== total) problems.push(`Prices changed since this screen loaded (the server total is ${fmt(checked.data.totalCents)}). Reload the page before taking payment.`);
  }
  if (paid > total) problems.push("Payments exceed the total.");
  if (balance > 0 && !customer) problems.push("Link a customer to leave a balance due.");
  if (cash && cash.tenderedCents !== null && cash.amountCents && cash.tenderedCents < cash.amountCents) problems.push("Cash tendered is less than the cash amount.");
  const confirmed = checked?.ok && !problems.length;

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
    setAttempt(null);
    setDone(null);
    act.reset();
    searchRef.current?.focus();
  };

  const submit = () => {
    const payload = {
      branchId,
      customerId: customer?.id ?? null,
      items: saleItems,
      orderDiscount,
      payments: effectivePayments.filter((p) => (p.amountCents ?? 0) > 0).map((p) => ({ method: p.method, amountCents: p.amountCents!, tenderedCents: p.method === "cash" ? p.tenderedCents : null, reference: p.reference || null })),
      notes,
    };
    // A retry of the same cart reuses its request id (so a lost response can't charge twice); if the cart
    // changed after a failed attempt it is a different request and gets a new id.
    const fingerprint = JSON.stringify(payload);
    const key = !attempt || attempt.fingerprint === fingerprint ? cartKey : newKey();
    if (key !== cartKey) setCartKey(key);
    setAttempt({ fingerprint });
    return act.run({ ...payload, idempotencyKey: key });
  };
  const canSubmit = lines.length > 0 && problems.length === 0 && !act.pending && !done;

  const resume = (r: ResumedCart) => {
    const kept = r.cart.lines.filter((l) => byId.has(l.variantId));
    const skipped = r.cart.lines.length - kept.length;
    setLines(kept.map((l) => ({ variantId: l.variantId, qty: l.qty, customPriceCents: l.customPriceCents })));
    setDiscount(r.cart.discount);
    setNotes(r.cart.notes);
    setCustomer(r.customer);
    setPayments([{ method: "cash", amountCents: null, tenderedCents: null, reference: "" }]);
    setPartial(false);
    setCartKey(newKey());
    setAttempt(null);
    setHeldCount((n) => Math.max(0, n - 1));
    toast.success(`Resumed “${r.label}”`);
    if (skipped) toast.warning(`${skipped} item${skipped === 1 ? " is" : "s are"} no longer sold at this branch and ${skipped === 1 ? "was" : "were"} left out.`);
  };

  // Keyboard: "/" or F2 focuses search, F8 holds the cart, F9 or Ctrl+Enter completes the sale.
  useEffect(() => {
    shortcuts.current = {
      submit: () => (canSubmit ? void submit() : problems[0] && lines.length ? toast.error(problems[0]) : undefined),
      hold: () => lines.length && !done && setHoldOpen(true),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "F2" || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F9" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
        e.preventDefault();
        shortcuts.current.submit();
      } else if (e.key === "F8") {
        e.preventDefault();
        shortcuts.current.hold();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "This branch";
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

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
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  setQ("");
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  void scan();
                }
              }}
              placeholder="Search or scan barcode / SKU, then Enter"
              aria-label="Search products"
              aria-keyshortcuts="/ F2"
              title="Shortcuts: / or F2 search · Esc clear · F8 hold · F9 complete sale"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex gap-2">
            {branches.length > 1 ? (
              <Select aria-label="Branch" value={branchId} onChange={(e) => router.push(`/app/pos?branch=${e.target.value}`)} className="h-10 w-auto flex-1 font-medium sm:w-48 sm:flex-none">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <HeldCartsDialog branchId={branchId} count={heldCount} onCount={setHeldCount} cartHasItems={lines.length > 0} fmt={fmt} onResume={resume} />
            <InsightsDialog branchId={branchId} branchName={branchName} fmt={fmt} onAdd={addById} />
          </div>
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
                <CountBadge active={active}>{c.id === "all" ? allItems.length : counts.get(c.id) ?? 0}</CountBadge>
              </button>
            );
          })}
        </div>
        <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto pb-1 text-[12px]" role="group" aria-label="Stock filter and recent items">
          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            onClick={() => setInStockOnly((v) => !v)}
            className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 font-medium", inStockOnly ? "border-ink bg-ink text-white" : "border-line-strong text-text-2 hover:text-text")}
          >
            {inStockOnly ? <Check className="size-3.5" /> : null} In stock only
          </button>
          {recentItems.length ? (
            <>
              <span className="ml-1.5 shrink-0 text-text-3">Recent</span>
              {recentItems.map((i) => (
                <button key={i.variantId} type="button" onClick={() => add(i)} className="inline-flex h-7 max-w-[220px] shrink-0 items-center truncate rounded-full border border-line bg-surface px-2.5 text-text-2 hover:border-line-strong hover:text-text" title={`Add ${i.productName}`}>
                  <span className="truncate">
                    {i.productName}
                    {i.label !== "Default" ? ` · ${i.label}` : ""}
                  </span>
                </button>
              ))}
            </>
          ) : null}
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-line-strong p-10 text-center text-[13px] text-text-3">{q ? `No products match “${q}”. Press Enter to look up an exact SKU or barcode.` : "No products to show."}</div>
        ) : (
          <ul className="scroll-thin grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto pr-1 max-lg:max-h-[58vh] md:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => {
              const inCart = qtyInCart(item.variantId);
              const left = Math.max(0, item.available - inCart);
              const out = item.productType === "stock" && left <= 0;
              const low = item.productType === "stock" && !out && left <= Math.max(1, item.reorderPoint);
              const stockLabel = item.productType === "stock" ? (low ? `Low · ${left} left` : `${left} in stock`) : item.productType === "service" ? "Service" : "Made to order";
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
                      <span className={cn("absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", out ? "bg-neg text-white" : low ? "bg-warn-soft text-warn" : "bg-ink text-white")}>{out ? "Out of stock" : stockLabel}</span>
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
            Current sale · {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="tabular">{fmt(total)} · Review</span>
        </a>
      ) : null}
      <aside id="current-sale" aria-label="Current sale" className="flex min-h-0 scroll-mt-4 flex-col rounded-[16px] border border-line bg-surface-2">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">Current sale</h2>
          {lines.length ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setHoldOpen(true)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-text-2 hover:text-text hover:underline" aria-keyshortcuts="F8">
                <PauseCircle className="size-3.5" /> Hold
              </button>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-neg hover:underline">
                <RotateCcw className="size-3.5" /> Clear
              </button>
            </div>
          ) : null}
        </div>
        <div className="px-4 pb-3">
          <CustomerPicker value={customer} onChange={setCustomer} branches={branches} canCreate={canCreateCustomer} compact />
          {custInfo && custInfo.visits !== null ? (
            <div className="mt-2 flex flex-col gap-0.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-text-2">
              <p>
                {custInfo.visits ? `${custInfo.visits} previous purchase${custInfo.visits === 1 ? "" : "s"}` : "First purchase"}
                {custInfo.lastPurchaseAt ? ` · last ${new Date(custInfo.lastPurchaseAt).toLocaleDateString(money.locale, { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </p>
              {custInfo.outstanding && custInfo.outstanding.count > 0 ? (
                <p className="font-medium text-warn">
                  Owes {fmt(custInfo.outstanding.totalCents)} on {custInfo.outstanding.count} earlier sale{custInfo.outstanding.count === 1 ? "" : "s"} ·{" "}
                  <Link href={`/app/customers/${customer!.id}`} className="underline-offset-2 hover:underline">
                    View
                  </Link>
                </p>
              ) : null}
              {custInfo.recentItems.length ? (
                <p className="truncate text-text-3" title={custInfo.recentItems.map((i) => i.productName).join(", ")}>
                  Recently: {[...new Set(custInfo.recentItems.map((i) => (i.variantLabel && i.variantLabel !== "Default" ? `${i.productName} (${i.variantLabel})` : i.productName)))].join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
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
            {lines.length ? (
              <p className={cn("flex items-center gap-1 text-[11.5px]", confirmed ? "text-pos" : "text-text-3")} aria-live="polite">
                {confirmed ? (
                  <>
                    <CircleCheck className="size-3.5" aria-hidden="true" /> Prices and stock checked by the server
                  </>
                ) : !checked && quoteKey ? (
                  "Checking prices and stock…"
                ) : null}
              </p>
            ) : null}
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
            <p className="text-[11.5px] text-text-3">Card, GCash, Maya and bank payments are confirmed on the external terminal or app and recorded here manually — no payment gateway is connected, so they aren&apos;t electronically verified.</p>
          </div>

          {balance > 0 && total > 0 ? <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Balance due after this sale: {fmt(balance)}</p> : null}
          {change > 0 ? <p className="rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] font-medium">Change due: {fmt(change)}</p> : null}
          {problems.length && lines.length ? <p className="text-[12.5px] text-neg">{problems[0]}</p> : null}
          {act.error ? <p className="text-[12.5px] text-neg" role="alert">{act.error}</p> : null}
          <Button variant="accent" size="lg" className="w-full justify-center rounded-full" disabled={!canSubmit} loading={act.pending} onClick={submit} aria-keyshortcuts="F9 Control+Enter">
            Complete sale · {fmt(total)}
          </Button>
          <p className="hidden text-center text-[11px] text-text-3 lg:block">/ search · F8 hold · F9 complete</p>
        </div>
      </aside>

      <HoldCartDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        defaultLabel={customer?.name ?? ""}
        payload={() => ({ branchId, customerId: customer?.id ?? null, lines, discount, notes, estimatedTotalCents: total })}
        onHeld={() => {
          setHeldCount((n) => n + 1);
          reset();
        }}
      />

      <DialogRoot open={Boolean(done)} onOpenChange={(o) => !o && reset()}>
        {done ? (
          <DialogContent size="sm" title={`Sale ${done.number} completed`} description="Stock, payments and the customer's history have been updated.">
            <div className="flex flex-col items-center gap-1 py-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check className="size-6" />
              </span>
              <p className="mt-2 font-display text-[28px] font-semibold tabular">{fmt(done.totalCents)}</p>
              <p className="text-[13px] text-text-2">{done.balanceDueCents > 0 ? `Partially paid: ${fmt(done.totalCents - done.balanceDueCents)} received` : "Paid in full"}</p>
              {done.changeCents > 0 ? <p className="text-[14px] font-medium">Change due: {fmt(done.changeCents)}</p> : null}
              {done.balanceDueCents > 0 ? <p className="text-[13px] text-warn">Balance due: {fmt(done.balanceDueCents)}</p> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ButtonLink href={`/print/receipt/${done.saleId}`} target="_blank" className="justify-center">
                <Printer /> Receipt
              </ButtonLink>
              <a href={`/api/sales/${done.saleId}/receipt`} className={buttonClass("secondary", "md", "justify-center")} download>
                <Download /> PDF
              </a>
              <Button variant="primary" className="col-span-2 justify-center" onClick={reset}>
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
