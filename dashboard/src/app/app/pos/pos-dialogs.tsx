"use client";

import { AlertTriangle, BarChart3, Check, Clock3, Download, PauseCircle, Play, Printer, Trash2, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/form";
import type { PickedCustomer } from "@/components/app/customer-picker";
import { cn } from "@/lib/cn";
import { MANUAL_PAYMENT_NOTE, NON_CASH_METHODS } from "@/lib/receipt";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import type { PosItem, ProductGroup } from "./terminal";
import { cancelHeldCartAction, holdCartAction, listHeldCartsAction, posInsightsAction, resumeHeldCartAction } from "./actions";

type ActionData<F extends (...args: never[]) => Promise<unknown>> = Extract<Awaited<ReturnType<F>>, { ok: true }> extends { data: infer D } ? NonNullable<D> : never;
export type HeldCartRow = ActionData<typeof listHeldCartsAction>[number];
export type ResumedCart = ActionData<typeof resumeHeldCartAction>;
type Insights = ActionData<typeof posInsightsAction>;

const ago = (d: Date | string) => {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

// ─── Hold ────────────────────────────────────────────────────────────────────

export function HoldCartDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultLabel: string;
  payload: () => Record<string, unknown>;
  onHeld: () => void;
}) {
  // The content mounts on open, so the name field starts from the current customer each time.
  return (
    <DialogRoot open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <HoldCartContent {...props} /> : null}
    </DialogRoot>
  );
}

function HoldCartContent({ onOpenChange, defaultLabel, payload, onHeld }: { onOpenChange: (o: boolean) => void; defaultLabel: string; payload: () => Record<string, unknown>; onHeld: () => void }) {
  const [label, setLabel] = useState(defaultLabel);
  const act = useAction(holdCartAction, { onSuccess: () => (onOpenChange(false), onHeld()) });
  return (
    <DialogContent
      size="sm"
      title="Put this sale on hold"
      description="Saves the cart so you can serve someone else and resume it later at this branch. Holding doesn't reserve stock: availability and prices are checked again when you resume and at checkout. Held carts expire after 7 days."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={act.pending} onClick={() => act.run({ ...payload(), label })}>
            <PauseCircle /> Hold cart
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act.run({ ...payload(), label });
        }}
      >
        <TextField label="Name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} hint="So the next cashier can find it, e.g. the customer's name." autoFocus error={act.error ?? undefined} />
      </form>
    </DialogContent>
  );
}

// ─── Held carts ──────────────────────────────────────────────────────────────

export function HeldCartsDialog({
  branchId,
  count,
  onCount,
  cartHasItems,
  fmt,
  onResume,
}: {
  branchId: string;
  count: number;
  onCount: (n: number) => void;
  cartHasItems: boolean;
  fmt: (c: number) => string;
  onResume: (cart: ResumedCart) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HeldCartRow[] | null>(null);
  const list = useAction(listHeldCartsAction, { silent: true, onSuccess: (r) => (setRows(r), onCount(r.length)) });
  const resume = useAction(resumeHeldCartAction, { onSuccess: (r) => (setOpen(false), onResume(r)) });
  const discard = useAction(cancelHeldCartAction, { onSuccess: () => list.run(branchId) });
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) list.run(branchId);
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-9 max-sm:px-2.5" aria-label={`Held carts (${count})`}>
          <PauseCircle /> <span className="max-sm:hidden">Held</span>
          {count ? <span className="rounded-full bg-ink px-1.5 text-[11px] font-semibold text-white tabular">{count}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent size="md" title="Held carts" description="Carts on hold at this branch. They don't reserve stock and expire after 7 days.">
        {cartHasItems ? <p className="mb-3 rounded-[10px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Finish, hold or clear the current sale before resuming another.</p> : null}
        {rows === null ? (
          <p className="py-6 text-center text-[13px] text-text-3">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">No carts on hold.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{r.label}</p>
                  <p className="truncate text-[12px] text-text-3">
                    {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · about {fmt(r.estimatedTotalCents)} · {r.heldBy ? `${r.heldBy}, ` : ""}
                    {ago(r.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Discard ${r.label}`} loading={discard.pending} onClick={() => discard.run(r.id)}>
                  <Trash2 />
                </Button>
                <Button size="sm" variant="primary" disabled={cartHasItems} loading={resume.pending} onClick={() => resume.run(r.id)}>
                  <Play /> Resume
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

// ─── Insights ────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children, className }: { icon: typeof BarChart3; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[12px] border border-line bg-surface p-3", className)}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-text-2">
        <Icon className="size-3.5" aria-hidden="true" /> {title}
      </h3>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-text-3">{children}</p>;

export function InsightsDialog({ branchId, branchName, fmt, onAdd }: { branchId: string; branchName: string; fmt: (c: number) => string; onAdd: (variantId: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Insights | null>(null);
  const load = useAction(posInsightsAction, { silent: true, onSuccess: setData });
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load.run(branchId);
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-9 max-sm:px-2.5" aria-label="Insights">
          <BarChart3 /> <span className="max-sm:hidden">Insights</span>
        </Button>
      </DialogTrigger>
      <DialogContent size="lg" title={`${branchName}: counter insights`} description="From recorded sales and stock at this branch. Refunded units are excluded.">
        {!data ? (
          <p className="py-8 text-center text-[13px] text-text-3">{load.error ?? "Loading…"}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Section icon={TrendingUp} title="Popular here · last 30 days">
              {data.popular.length ? (
                <ol className="flex flex-col gap-1 text-[13px]">
                  {data.popular.map((p, i) => (
                    <li key={p.variantId} className="flex items-center gap-2">
                      <span className="w-4 font-mono text-[11px] text-text-3">{i + 1}</span>
                      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onAdd(p.variantId)} title="Add to sale">
                        {p.productName}
                        {p.variantLabel && p.variantLabel !== "Default" ? <span className="text-text-3"> · {p.variantLabel}</span> : null}
                      </button>
                      <span className="tabular text-text-2">{p.quantity} sold</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>No sales in the last 30 days.</Empty>
              )}
            </Section>
            <Section icon={AlertTriangle} title="Low stock at this branch">
              {data.lowStock.length ? (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {data.lowStock.map((p) => (
                    <li key={p.variantId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {p.productName}
                        {p.variantLabel !== "Default" ? <span className="text-text-3"> · {p.variantLabel}</span> : null}
                      </span>
                      <span className={cn("tabular", p.available <= 0 ? "text-neg" : "text-warn")}>{p.available <= 0 ? "Out" : `${p.available} left`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nothing at or below its reorder point.</Empty>
              )}
            </Section>
            {data.visible.sales ? (
              <Section icon={Clock3} title={`Outstanding balances · ${data.outstanding.count} sale${data.outstanding.count === 1 ? "" : "s"}, ${fmt(data.outstanding.totalCents)}`}>
                {data.outstanding.sales.length ? (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {data.outstanding.sales.map((s) => (
                      <li key={s.saleId} className="flex items-center gap-2">
                        <Link href={`/app/sales/${s.saleId}`} className="min-w-0 flex-1 truncate hover:underline">
                          {s.number} <span className="text-text-3">· {s.customerName ?? "Walk-in"}</span>
                        </Link>
                        <span className="tabular text-warn">{fmt(s.balanceDueCents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No balances due.</Empty>
                )}
              </Section>
            ) : null}
            {data.visible.customers ? (
              <Section icon={Users} title="Repeat customers · last 90 days">
                {data.repeatCustomers.length ? (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {data.repeatCustomers.map((c) => (
                      <li key={c.customerId} className="flex items-center gap-2">
                        <Link href={`/app/customers/${c.customerId}`} className="min-w-0 flex-1 truncate hover:underline">
                          {c.name} <span className="text-text-3">· {c.code}</span>
                        </Link>
                        <span className="tabular text-text-2">
                          {c.visits} visits · {fmt(c.spentCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No customer bought twice here in 90 days.</Empty>
                )}
              </Section>
            ) : null}
            {data.visible.sales ? (
              <Section icon={BarChart3} title="Recent transactions" className="md:col-span-2">
                {data.recent.length ? (
                  <ul className="grid gap-x-6 gap-y-1 text-[13px] md:grid-cols-2">
                    {data.recent.map((s) => (
                      <li key={s.saleId} className="flex items-center gap-2">
                        <Link href={`/app/sales/${s.saleId}`} className="min-w-0 flex-1 truncate hover:underline">
                          {s.number} <span className="text-text-3">· {s.customerName ?? "Walk-in"} · {ago(s.createdAt)}</span>
                        </Link>
                        <span className={cn("tabular", s.status === "cancelled" && "text-text-3 line-through")}>{fmt(s.totalCents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No transactions yet.</Empty>
                )}
              </Section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

// ─── Variant picker ──────────────────────────────────────────────────────────

export function VariantPicker({ group, onClose, fmt, left, onPick }: { group: ProductGroup | null; onClose: () => void; fmt: (c: number) => string; left: (v: PosItem) => number; onPick: (v: PosItem) => void }) {
  return (
    <DialogRoot open={Boolean(group)} onOpenChange={(o) => !o && onClose()}>
      {group ? (
        <DialogContent size="md" title={group.name} description={`${group.variants.length} options${group.brand ? ` · ${group.brand}` : ""}. Stock shown is for this branch.`}>
          <ul className="flex flex-col gap-1.5" aria-label="Options">
            {group.variants.map((v, i) => {
              const n = left(v);
              const out = n <= 0;
              const low = Number.isFinite(n) && !out && n <= Math.max(1, v.reorderPoint);
              return (
                <li key={v.variantId}>
                  <button
                    type="button"
                    disabled={out}
                    autoFocus={i === group.variants.findIndex((x) => left(x) > 0)}
                    onClick={() => onPick(v)}
                    className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{v.label}</span>
                      <span className="block truncate text-[11.5px] text-text-3">
                        {v.sku}
                        {v.barcode ? ` · ${v.barcode}` : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-[12px] font-medium tabular", out ? "text-neg" : low ? "text-warn" : "text-text-2")}>
                      {!Number.isFinite(n) ? (v.productType === "service" ? "Service" : "Made to order") : out ? "Out of stock" : low ? `Low · ${n} left` : `${n} in stock`}
                    </span>
                    <span className="w-24 shrink-0 text-right text-[13.5px] font-semibold tabular">{fmt(v.priceCents)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      ) : null}
    </DialogRoot>
  );
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

const SHORTCUTS: [string, string][] = [
  ["/ or F2", "Search products (then ↓ to move into the results)"],
  ["Arrow keys", "Move between product tiles"],
  ["Enter", "Add the selected product, or the scanned barcode / SKU"],
  ["Alt + C", "Find or add a customer"],
  ["Ctrl + Enter", "Go to payment, then complete the sale"],
  ["F8", "Hold the current sale"],
  ["Esc", "Close a dialog, or go back from payment to the cart"],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent size="sm" title="Keyboard shortcuts" description="Chosen so they don't clash with the browser's own keys.">
          <dl className="flex flex-col divide-y divide-line text-[13px]">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-2">
                <dt>
                  <kbd className="rounded-[6px] border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px]">{k}</kbd>
                </dt>
                <dd className="text-right text-text-2">{d}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      ) : null}
    </DialogRoot>
  );
}

// ─── Sale complete ───────────────────────────────────────────────────────────

export type CompletedSale = {
  saleId: string;
  number: string;
  totalCents: number;
  balanceDueCents: number;
  customer: PickedCustomer | null;
  lines: { name: string; label: string; qty: number; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  payments: { method: string; amountCents: number; reference: string | null; tenderedCents: number | null }[];
};

export function SaleCompleteDialog({ sale, fmt, onNewSale }: { sale: CompletedSale | null; fmt: (c: number) => string; onNewSale: () => void }) {
  const paidNow = sale ? sale.payments.reduce((s, p) => s + p.amountCents, 0) : 0;
  const change = sale ? sale.payments.reduce((s, p) => s + (p.tenderedCents !== null && p.tenderedCents > p.amountCents ? p.tenderedCents - p.amountCents : 0), 0) : 0;
  return (
    <DialogRoot open={Boolean(sale)} onOpenChange={(o) => !o && onNewSale()}>
      {sale ? (
        <DialogContent size="md" title={`Sale ${sale.number} completed`} description="Saved. Stock, payments and the customer's history are updated; CRM sync happens in the background.">
          <div className="flex flex-col gap-4 text-[13px]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[24px] leading-tight font-semibold tabular">{fmt(sale.totalCents)}</p>
                <p className="text-text-2">{sale.customer ? `${sale.customer.name} · ${sale.customer.code}` : "Walk-in customer"}</p>
              </div>
              <div className="text-right">
                {change > 0 ? <p className="text-[15px] font-semibold">Change {fmt(change)}</p> : null}
                <p className={cn(sale.balanceDueCents > 0 ? "font-medium text-warn" : "text-text-2")}>{sale.balanceDueCents > 0 ? `Balance due ${fmt(sale.balanceDueCents)}` : "Paid in full"}</p>
              </div>
            </div>
            <ul className="divide-y divide-line rounded-[12px] border border-line bg-surface px-3" aria-label="Items sold">
              {sale.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {l.qty} × {l.name}
                    </span>
                    {l.label !== "Default" ? <span className="block truncate text-[11.5px] text-text-3">{l.label}</span> : null}
                  </span>
                  <span className="shrink-0 tabular">{fmt(l.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1">
              <div className="flex justify-between text-text-2">
                <dt>Subtotal</dt>
                <dd className="tabular">{fmt(sale.subtotalCents)}</dd>
              </div>
              {sale.discountCents ? (
                <div className="flex justify-between text-neg">
                  <dt>Discounts</dt>
                  <dd className="tabular">−{fmt(sale.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-text-2">
                <dt>Tax</dt>
                <dd className="tabular">{fmt(sale.taxCents)}</dd>
              </div>
              {sale.payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <dt>
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {NON_CASH_METHODS.has(p.method) ? " *" : ""}
                  </dt>
                  <dd className="tabular">{fmt(p.amountCents)}</dd>
                </div>
              ))}
              {!sale.payments.length ? <p className="text-text-3">No payment taken now.</p> : null}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                <dt>Received now</dt>
                <dd className="tabular">{fmt(paidNow)}</dd>
              </div>
            </dl>
            {sale.payments.some((p) => NON_CASH_METHODS.has(p.method)) ? <p className="text-[11.5px] text-text-3">* {MANUAL_PAYMENT_NOTE}</p> : null}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ButtonLink href={`/print/receipt/${sale.saleId}`} target="_blank" className="justify-center">
              <Printer /> Print receipt
            </ButtonLink>
            <a href={`/api/sales/${sale.saleId}/receipt`} className={buttonClass("secondary", "md", "justify-center")} download>
              <Download /> PDF
            </a>
            <Button variant="primary" className="col-span-2 justify-center sm:col-span-1" onClick={onNewSale} autoFocus>
              New sale
            </Button>
          </div>
          <Link href={`/app/sales/${sale.saleId}`} className="mt-3 block text-center text-[12.5px] text-text-2 hover:text-text">
            View transaction details
          </Link>
        </DialogContent>
      ) : null}
    </DialogRoot>
  );
}
