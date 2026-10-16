"use client";

import { Check, Keyboard, LogOut, Maximize2, Minimize2, Plus, ScanBarcode, Search, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { PickedCustomer } from "@/components/app/customer-picker";
import { newKey, useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { CountBadge } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { priceSale, PricingError } from "@/lib/pricing";
import { checkoutAction, listHeldCartsAction, posCustomerContextAction, posLookupAction, quoteCartAction } from "./actions";
import { CartPanel, CheckedLine, lineDiscountCents, PaymentPanel, type CustomerContext, type Line, type LineDiscount, type Pay } from "./pos-cart";
import { HeldCartsDialog, HoldCartDialog, InsightsDialog, SaleCompleteDialog, ShortcutsDialog, VariantPicker, type CompletedSale, type ResumedCart } from "./pos-dialogs";

export type PosItem = {
  variantId: string;
  productId: string;
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

/** One tile per product; its variants (sizes, colours, powers) are chosen in a picker. */
export type ProductGroup = { productId: string; name: string; brand: string | null; imageUrl: string | null; categoryId: string; productType: PosItem["productType"]; variants: PosItem[] };

type QuoteResult = Awaited<ReturnType<typeof quoteCartAction>>;
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

// Browser full screen, as an external store (it can also be left with Esc or F11).
function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}
const noopSubscribe = () => () => {};

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function PosTerminal({
  items,
  popularIds,
  categories,
  branchId,
  branches,
  business,
  cashier,
  tax,
  money,
  maxDiscountBps,
  canDiscountUnlimited,
  canCreateCustomer,
  initialCustomer,
}: {
  items: PosItem[];
  popularIds: string[];
  categories: { id: string; name: string }[];
  branchId: string;
  branches: { id: string; name: string }[];
  business: { name: string; demo: boolean };
  cashier: { name: string; role: string };
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
  const [payments, setPayments] = useState<Pay[]>([]);
  const [panel, setPanel] = useState<"cart" | "payment">("cart");
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");
  const [notes, setNotes] = useState("");
  const [cartKey, setCartKey] = useState(newKey());
  const [attempt, setAttempt] = useState<{ fingerprint: string } | null>(null);
  const [done, setDone] = useState<CompletedSale | null>(null);
  const [extraItems, setExtraItems] = useState<PosItem[]>([]);
  const [quote, setQuote] = useState<{ key: string; result: QuoteResult } | null>(null);
  const [customerCtx, setCustomerCtx] = useState<{ id: string; data: CustomerContext } | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [holdOpen, setHoldOpen] = useState(false);
  const [picker, setPicker] = useState<ProductGroup | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const cartRef = useRef<HTMLElement>(null);
  const shortcuts = useRef<{ charge: () => void; hold: () => void; back: () => void }>({ charge: () => {}, hold: () => {}, back: () => {} });
  const recentKey = `pos:recent:${branchId}`;
  const recentRaw = useSyncExternalStore(subscribeRecent, () => readRecentRaw(recentKey), () => "[]");
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);
  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  const fullscreenSupported = useSyncExternalStore(noopSubscribe, () => Boolean(document.fullscreenEnabled), () => false);

  const allItems = useMemo(() => {
    const known = new Set(items.map((i) => i.variantId));
    return [...items, ...extraItems.filter((i) => !known.has(i.variantId))];
  }, [items, extraItems]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.variantId, i])), [allItems]);
  const groups = useMemo(() => {
    const m = new Map<string, ProductGroup>();
    for (const i of allItems) {
      const g = m.get(i.productId) ?? { productId: i.productId, name: i.productName, brand: i.brand, imageUrl: i.imageUrl, categoryId: i.categoryId, productType: i.productType, variants: [] };
      g.variants.push(i);
      m.set(i.productId, g);
    }
    return [...m.values()];
  }, [allItems]);
  const popularRank = useMemo(() => new Map(popularIds.map((id, i) => [id, i])), [popularIds]);

  useEffect(() => {
    listHeldCartsAction(branchId)
      .then((r) => r.ok && setHeldCount(r.data.length))
      .catch(() => undefined);
  }, [branchId]);

  const qtyInCart = (variantId: string) => lines.filter((l) => l.variantId === variantId).reduce((s, l) => s + l.qty, 0);
  const left = (v: PosItem) => (v.productType === "stock" ? Math.max(0, v.available - qtyInCart(v.variantId)) : Infinity);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = groups.filter((g) => {
      if (category === "popular") {
        if (!g.variants.some((v) => popularRank.has(v.variantId))) return false;
      } else if (category !== "all" && g.categoryId !== category) return false;
      if (inStockOnly && g.productType === "stock" && !g.variants.some((v) => v.available > 0)) return false;
      if (!term) return true;
      return g.variants.some((v) => `${g.name} ${g.brand ?? ""} ${v.label} ${v.sku} ${v.barcode ?? ""}`.toLowerCase().includes(term));
    });
    if (category === "popular") {
      const best = (g: ProductGroup) => Math.min(...g.variants.map((v) => popularRank.get(v.variantId) ?? 999));
      list = [...list].sort((a, b) => best(a) - best(b));
    }
    return list;
  }, [groups, q, category, inStockOnly, popularRank]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.categoryId, (m.get(g.categoryId) ?? 0) + 1);
    return m;
  }, [groups]);
  const popularCount = useMemo(() => groups.filter((g) => g.variants.some((v) => popularRank.has(v.variantId))).length, [groups, popularRank]);
  const recentItems = recent.map((id) => byId.get(id)).filter((i): i is PosItem => Boolean(i));

  const remember = (variantId: string) => {
    const next = [variantId, ...recent.filter((x) => x !== variantId)].slice(0, RECENT_MAX);
    try {
      window.localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      return;
    }
    recentListeners.forEach((cb) => cb());
  };

  const add = (item: PosItem) => {
    if (item.productType === "stock" && qtyInCart(item.variantId) >= item.available) {
      toast.error(`No more ${item.productName}${item.label !== "Default" ? ` (${item.label})` : ""} in stock at this branch.`);
      return false;
    }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === item.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { variantId: item.variantId, qty: 1, customPriceCents: null, discount: null }];
    });
    remember(item.variantId);
    setPanel("cart"); // the payment amounts no longer match the cart
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
  const choose = (g: ProductGroup) => (g.variants.length === 1 ? add(g.variants[0]) : setPicker(g));

  const scan = async () => {
    const raw = q.trim();
    const term = raw.toLowerCase();
    if (!term) return;
    const exact = allItems.find((i) => i.barcode === raw || i.sku.toLowerCase() === term);
    if (exact) {
      if (add(exact)) setQ("");
      return;
    }
    if (visible.length === 1) {
      choose(visible[0]);
      if (visible[0].variants.length === 1) setQ("");
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

  // ── Pricing (shown immediately; the server re-prices and checkout is authoritative) ──
  const orderDiscount =
    discount.type === "percent" && discount.value
      ? { type: "percent" as const, valueBps: Math.round(Number(discount.value) * 100) }
      : discount.type === "amount" && discount.value
        ? { type: "amount" as const, valueCents: Math.round(Number(discount.value) * 100) }
        : null;
  const unitOf = (l: Line) => {
    const it = byId.get(l.variantId)!;
    return it.productType === "made_to_order" && l.customPriceCents !== null ? l.customPriceCents : it.priceCents;
  };
  let priced: ReturnType<typeof priceSale> | null = null;
  let pricingError: string | null = null;
  if (lines.length) {
    try {
      priced = priceSale(
        lines.map((l, i) => ({ key: String(i), quantity: l.qty, unitPriceCents: unitOf(l), lineDiscountCents: lineDiscountCents(l.discount, unitOf(l) * l.qty), taxExempt: byId.get(l.variantId)!.taxExempt })),
        { rateBps: tax.rateBps, pricesIncludeTax: tax.pricesIncludeTax },
        orderDiscount,
      );
    } catch (e) {
      pricingError = e instanceof PricingError ? e.message : "Check the discounts.";
    }
  }
  const total = priced?.totalCents ?? 0;
  const discountTooHigh = priced && !canDiscountUnlimited && priced.subtotalCents > 0 && priced.discountCents * 10000 > priced.subtotalCents * maxDiscountBps;

  const saleItems = lines.map((l) => {
    const it = byId.get(l.variantId)!;
    return { variantId: l.variantId, quantity: l.qty, lineDiscountCents: lineDiscountCents(l.discount, unitOf(l) * l.qty), unitPriceCents: it.productType === "made_to_order" ? l.customPriceCents : null };
  });

  // The server re-prices the cart and checks stock as it changes.
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

  const cartProblems: string[] = [];
  if (pricingError) cartProblems.push(pricingError);
  if (discountTooHigh) cartProblems.push(`Discounts above ${maxDiscountBps / 100}% need a manager.`);
  if (checked && !checked.ok) cartProblems.push(checked.error);
  if (checked?.ok) {
    cartProblems.push(...checked.data.problems.filter((p) => !discountTooHigh || !p.startsWith("Discounts above")));
    if (checked.data.totalCents !== total) cartProblems.push(`Prices changed since this screen loaded (the server total is ${fmt(checked.data.totalCents)}). Reload the page before taking payment.`);
  }
  const confirmed = Boolean(checked?.ok) && cartProblems.length === 0;
  const canCharge = lines.length > 0 && cartProblems.length === 0;

  const paid = payments.reduce((s, p) => s + Math.max(0, p.amountCents), 0);
  const balance = total - paid;
  const payProblems: string[] = [];
  if (paid > total) payProblems.push("Payments add up to more than the total. Enter the amount applied; record cash received separately.");
  if (balance > 0 && !customer) payProblems.push("Link a customer to leave a balance due.");
  if (payments.some((p) => p.method === "cash" && p.tenderedCents !== null && p.tenderedCents < p.amountCents)) payProblems.push("Cash received is less than the cash amount.");

  const act = useAction(checkoutAction, { silent: true, onSuccess: () => undefined });

  const resetSale = () => {
    setLines([]);
    setCustomer(null);
    setDiscount({ type: "none", value: "" });
    setPayments([]);
    setPanel("cart");
    setMobileView("products");
    setNotes("");
    setCartKey(newKey());
    setAttempt(null);
    setDone(null);
    act.reset();
    searchRef.current?.focus();
  };

  const openPayment = () => {
    if (!canCharge) {
      if (cartProblems[0]) toast.error(cartProblems[0]);
      return;
    }
    // Start from one cash payment for the full amount unless the cashier already set up payments for this total.
    if (!payments.length || paid !== total) setPayments([{ method: "cash", amountCents: total, tenderedCents: null, reference: "" }]);
    setPanel("payment");
    setMobileView("cart");
  };

  const submit = async () => {
    if (!canCharge || payProblems.length || act.pending) return;
    const paying = payments.filter((p) => p.amountCents > 0);
    const payload = {
      branchId,
      customerId: customer?.id ?? null,
      items: saleItems,
      orderDiscount,
      payments: paying.map((p) => ({ method: p.method, amountCents: p.amountCents, tenderedCents: p.method === "cash" ? p.tenderedCents : null, reference: p.reference || null })),
      notes,
    };
    // A retry of the same cart reuses its request id (so a lost response can't charge twice); if the cart
    // changed after a failed attempt it is a different request and gets a new id.
    const fingerprint = JSON.stringify(payload);
    const key = !attempt || attempt.fingerprint === fingerprint ? cartKey : newKey();
    if (key !== cartKey) setCartKey(key);
    setAttempt({ fingerprint });
    const snapshotLines = lines.map((l, i) => {
      const it = byId.get(l.variantId)!;
      return { name: it.productName, label: it.label, qty: l.qty, lineTotalCents: priced?.lines[i]?.lineTotalCents ?? 0 };
    });
    const r = await act.run({ ...payload, idempotencyKey: key });
    if (r.ok) {
      setDone({
        ...r.data,
        customer,
        lines: snapshotLines,
        subtotalCents: priced?.subtotalCents ?? 0,
        discountCents: priced?.discountCents ?? 0,
        taxCents: priced?.taxCents ?? 0,
        payments: paying.map((p) => ({ method: p.method, amountCents: p.amountCents, reference: p.reference || null, tenderedCents: p.method === "cash" ? p.tenderedCents : null })),
      });
    }
  };

  const resume = (r: ResumedCart) => {
    const kept = r.cart.lines.filter((l) => byId.has(l.variantId));
    const skipped = r.cart.lines.length - kept.length;
    setLines(kept.map((l) => ({ variantId: l.variantId, qty: l.qty, customPriceCents: l.customPriceCents, discount: (l.discount as LineDiscount | null | undefined) ?? null })));
    setDiscount(r.cart.discount);
    setNotes(r.cart.notes);
    setCustomer(r.customer);
    setPayments([]);
    setPanel("cart");
    setMobileView("cart");
    setCartKey(newKey());
    setAttempt(null);
    setHeldCount((n) => Math.max(0, n - 1));
    toast.success(`Resumed “${r.label}”`);
    if (skipped) toast.warning(`${skipped} item${skipped === 1 ? " is" : "s are"} no longer sold at this branch and ${skipped === 1 ? "was" : "were"} left out.`);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Full screen isn't available here. The POS works the same without it.");
    }
  };
  const exitPos = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    router.push("/app");
  };

  // ── Keyboard ──
  useEffect(() => {
    shortcuts.current = {
      charge: () => (panel === "payment" ? void submit() : openPayment()),
      hold: () => lines.length && !done && setHoldOpen(true),
      back: () => panel === "payment" && setPanel("cart"),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return; // dialogs handle their own keys (Esc closes them)
      if (e.key === "F2" || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.altKey && !e.ctrlKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setMobileView("cart");
        setTimeout(() => cartRef.current?.querySelector<HTMLInputElement>('input[aria-label="Find customer"]')?.focus(), 0);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        shortcuts.current.charge();
      } else if (e.key === "F8") {
        e.preventDefault();
        shortcuts.current.hold();
      } else if (e.key === "Escape" && !isTyping(e.target)) {
        shortcuts.current.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Arrow keys move between product tiles (and back up to the search box). */
  const onGridKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const tiles = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-tile]") ?? [])];
    const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || !tiles.length) return;
    const cols = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length || 1;
    const next = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" ? i - cols : i + cols;
    e.preventDefault();
    if (next < 0) searchRef.current?.focus();
    else tiles[Math.min(next, tiles.length - 1)]?.focus();
  };

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "This branch";
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const tabs = [{ id: "all", name: "All products", count: groups.length }, ...(popularCount ? [{ id: "popular", name: "Popular here", count: popularCount }] : []), ...categories.map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }))];

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      {/* Compact POS header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-4">
        <div className="min-w-0">
          <p className="font-display text-[15px] leading-tight font-semibold whitespace-nowrap">Point of sale</p>
          <p className="truncate text-[11.5px] text-text-3">
            {business.name}
            {business.demo ? " · Demo data" : ""}
          </p>
        </div>
        {branches.length > 1 ? (
          <Select aria-label="Branch" value={branchId} onChange={(e) => router.push(`/app/pos?branch=${e.target.value}`)} className="h-9 w-auto max-w-[150px] text-[13px] font-medium">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-[13px] font-medium">{branchName}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 pr-1 lg:flex" title="Signed-in cashier">
            <Avatar name={cashier.name} size={28} />
            <span className="leading-tight">
              <span className="block text-[12.5px] font-medium">{cashier.name}</span>
              <span className="block text-[11px] text-text-3">{cashier.role}</span>
            </span>
          </div>
          <HeldCartsDialog branchId={branchId} count={heldCount} onCount={setHeldCount} cartHasItems={lines.length > 0} fmt={fmt} onResume={resume} />
          <InsightsDialog branchId={branchId} branchName={branchName} fmt={fmt} onAdd={addById} />
          <Button size="icon" variant="ghost" className="hidden sm:inline-flex" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
            <Keyboard />
          </Button>
          {fullscreenSupported ? (
            <Button size="icon" variant="ghost" aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"} title={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          ) : null}
          <Button variant="secondary" className="h-9" onClick={exitPos}>
            <LogOut /> <span className="max-sm:sr-only">Exit POS</span>
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_350px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Products */}
        <section aria-label="Products" className={cn("flex min-h-0 min-w-0 flex-col gap-3", mobileView === "cart" && "max-md:hidden")}>
          <div className="relative">
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
                } else if (e.key === "ArrowDown") {
                  const first = gridRef.current?.querySelector<HTMLButtonElement>("button[data-tile]");
                  if (first) {
                    e.preventDefault();
                    first.focus();
                  }
                }
              }}
              placeholder="Search products, or scan a barcode / SKU and press Enter"
              aria-label="Search products"
              aria-keyshortcuts="/ F2"
              className="h-11 pr-10 pl-9 text-[14px]"
            />
            <ScanBarcode className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
          </div>
          <div className="scroll-thin flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
            {tabs.map((c) => {
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
                  <CountBadge active={active}>{c.count}</CountBadge>
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
            <ul ref={gridRef} onKeyDown={onGridKey} className="scroll-thin grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto pr-1 pb-24 sm:grid-cols-3 md:grid-cols-2 md:pb-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visible.map((g) => {
                const inCart = g.variants.reduce((n, v) => n + qtyInCart(v.variantId), 0);
                const stockLeft = g.productType === "stock" ? g.variants.reduce((n, v) => n + left(v), 0) : null;
                const out = stockLeft === 0;
                const low = stockLeft !== null && !out && stockLeft <= Math.max(1, ...g.variants.map((v) => v.reorderPoint));
                const prices = g.variants.map((v) => v.priceCents);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const badge = stockLeft === null ? (g.productType === "service" ? "Service" : "Made to order") : out ? "Out of stock" : low ? `Low · ${stockLeft} left` : `${stockLeft} in stock`;
                const subtitle = g.variants.length > 1 ? `${g.variants.length} options` : g.variants[0].label !== "Default" ? g.variants[0].label : g.brand ?? g.variants[0].sku;
                return (
                  <li key={g.productId}>
                    <button
                      type="button"
                      data-tile
                      onClick={() => choose(g)}
                      disabled={out}
                      className={cn(
                        "group flex h-full w-full flex-col overflow-hidden rounded-[14px] border bg-surface text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        inCart ? "border-ink" : "border-line hover:border-line-strong",
                        out && "cursor-not-allowed opacity-55",
                      )}
                    >
                      <span className="relative block aspect-[16/11] bg-[#efeee8]">
                        {g.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : null}
                        <span className={cn("absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", out ? "bg-neg text-white" : low ? "bg-warn-soft text-warn" : "bg-ink text-white")}>{badge}</span>
                      </span>
                      <span className="flex flex-1 flex-col gap-0.5 p-3">
                        <span className="line-clamp-1 text-[13px] font-semibold">{g.name}</span>
                        <span className="line-clamp-1 text-[12px] text-text-3">{subtitle}</span>
                        <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                          <span className="text-[14px] font-semibold tabular">{min === max ? fmt(min) : `${fmt(min)}+`}</span>
                          <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium", inCart ? "bg-ink text-white" : "border border-line-strong text-text-2 group-hover:border-text-3")}>
                            {inCart ? (
                              <>
                                <Check className="size-3.5" /> {inCart}
                                <span className="sr-only"> in sale</span>
                              </>
                            ) : (
                              <>
                                <Plus className="size-3.5" /> {g.variants.length > 1 ? "Choose" : "Add"}
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

        {/* Phones: the cart is its own view; keep the running total in reach. */}
        {mobileView === "products" && lines.length ? (
          <button
            type="button"
            onClick={() => setMobileView("cart")}
            className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 rounded-full bg-ink px-5 py-3.5 text-[14px] font-medium text-white shadow-[var(--shadow-pop)] md:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="size-4" aria-hidden="true" /> {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span className="tabular">{fmt(total)} · Review sale</span>
          </button>
        ) : null}

        {/* Current sale */}
        <aside ref={cartRef} aria-label="Current sale" className={cn("flex min-h-[70dvh] flex-col rounded-[16px] border border-line bg-surface-2 md:min-h-0", mobileView === "products" && "max-md:hidden")}>
          <button type="button" onClick={() => setMobileView("products")} className="flex items-center gap-1 px-4 pt-3 text-[13px] font-medium text-text-2 md:hidden">
            ← Products
          </button>
          {panel === "cart" ? (
            <CartPanel
              lines={lines}
              byId={byId}
              priced={priced}
              fmt={fmt}
              customer={customer}
              setCustomer={setCustomer}
              customerInfo={custInfo}
              branches={branches}
              canCreateCustomer={canCreateCustomer}
              orderDiscount={discount}
              setOrderDiscount={setDiscount}
              tax={tax}
              onQty={(i, qty) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty } : x)))}
              onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
              onCustomPrice={(i, c) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, customPriceCents: c } : x)))}
              onLineDiscount={(i, d) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, discount: d } : x)))}
              onClear={resetSale}
              onHold={() => setHoldOpen(true)}
              onCharge={openPayment}
              chargeLabel={lines.length ? `Charge ${fmt(total)}` : "Charge"}
              canCharge={canCharge}
              status={<CheckedLine confirmed={confirmed} checking={!checked && Boolean(quoteKey)} />}
              problem={cartProblems[0] ?? null}
              locale={money.locale}
            />
          ) : (
            <PaymentPanel
              totalCents={total}
              payments={payments}
              setPayments={setPayments}
              fmt={fmt}
              customer={customer}
              onBack={() => setPanel("cart")}
              onComplete={() => void submit()}
              pending={act.pending}
              problem={cartProblems[0] ?? payProblems[0] ?? null}
              error={act.error}
            />
          )}
        </aside>
      </div>

      <VariantPicker group={picker} onClose={() => setPicker(null)} fmt={fmt} left={left} onPick={(v) => add(v) && setPicker(null)} />
      <HoldCartDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        defaultLabel={customer?.name ?? ""}
        payload={() => ({ branchId, customerId: customer?.id ?? null, lines, discount, notes, estimatedTotalCents: total })}
        onHeld={() => {
          setHeldCount((n) => n + 1);
          resetSale();
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SaleCompleteDialog sale={done} fmt={fmt} onNewSale={resetSale} />
    </div>
  );
}
