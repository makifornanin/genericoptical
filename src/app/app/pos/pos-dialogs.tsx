"use client";

import { AlertTriangle, BarChart3, Clock3, PauseCircle, Play, Trash2, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
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
        <Button className="h-10" aria-label={`Held carts (${count})`}>
          <PauseCircle /> Held{count ? <span className="rounded-full bg-ink px-1.5 text-[11px] font-semibold text-white tabular">{count}</span> : null}
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
        <Button className="h-10">
          <BarChart3 /> Insights
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
