"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { newKey, useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, MoneyInput, Select, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { priceSale, PricingError } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/schemas";
import { createOrderAction } from "../sales/actions";
import type { PosItem } from "../pos/terminal";
import { customerPrescriptionsAction } from "./actions";

type Line = { variantId: string; qty: number; priceCents: number | null; costCents: number | null; prescriptionId: string };

export function OrderForm({
  items,
  branches,
  branchId: initialBranch,
  suppliers,
  tax,
  money,
  initialCustomer,
  canCreateCustomer,
  canSeeCost,
  defaultLabId,
}: {
  items: (PosItem & { costCents: number | null })[];
  branches: { id: string; name: string }[];
  branchId: string;
  suppliers: { id: string; name: string }[];
  tax: { rateBps: number; pricesIncludeTax: boolean; name: string };
  money: { currency: string; locale: string };
  initialCustomer: PickedCustomer | null;
  canCreateCustomer: boolean;
  canSeeCost: boolean;
  defaultLabId: string;
}) {
  const router = useRouter();
  const fmt = (c: number) => formatMoney(c, money.currency, money.locale);
  const [branchId, setBranchId] = useState(initialBranch);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [loadedRx, setLoadedRx] = useState<{ customerId: string; rows: { id: string; label: string }[] } | null>(null);
  const rx = customer && loadedRx?.customerId === customer.id ? loadedRx.rows : [];
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [deposit, setDeposit] = useState<{ method: (typeof PAYMENT_METHODS)[number]; amountCents: number | null; reference: string }>({ method: "cash", amountCents: null, reference: "" });
  const [dueOn, setDueOn] = useState("");
  const [labSupplierId, setLabSupplierId] = useState(defaultLabId);
  const [labReference, setLabReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(true);
  const [key] = useState(newKey());
  const byId = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const save = useAction(createOrderAction, { success: (r) => `Order ${r.number} created`, onSuccess: (r) => router.push(`/app/orders/${r.saleId}`) });

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    customerPrescriptionsAction(customer.id).then((r) => {
      if (r.ok && !cancelled) setLoadedRx({ customerId: customer.id, rows: r.data });
    });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return items.filter((i) => `${i.productName} ${i.label} ${i.sku} ${i.brand ?? ""}`.toLowerCase().includes(term)).slice(0, 8);
  }, [items, q]);

  let priced: ReturnType<typeof priceSale> | null = null;
  let pricingError: string | null = null;
  if (lines.length) {
    try {
      priced = priceSale(
        lines.map((l, i) => {
          const it = byId.get(l.variantId)!;
          return { key: String(i), quantity: l.qty, unitPriceCents: it.productType === "made_to_order" && l.priceCents !== null ? l.priceCents : it.priceCents, taxExempt: it.taxExempt };
        }),
        { rateBps: tax.rateBps, pricesIncludeTax: tax.pricesIncludeTax },
      );
    } catch (e) {
      pricingError = e instanceof PricingError ? e.message : "Check the items.";
    }
  }
  const total = priced?.totalCents ?? 0;

  const submit = () =>
    save.run({
      branchId,
      customerId: customer?.id ?? "",
      items: lines.map((l) => {
        const it = byId.get(l.variantId)!;
        return {
          variantId: l.variantId,
          quantity: l.qty,
          lineDiscountCents: 0,
          unitPriceCents: it.productType === "made_to_order" ? l.priceCents : null,
          unitCostCents: it.productType === "made_to_order" ? l.costCents : null,
          prescriptionId: l.prescriptionId || null,
        };
      }),
      deposit: deposit.amountCents ? { method: deposit.method, amountCents: deposit.amountCents, reference: deposit.reference || null } : null,
      dueOn: dueOn || null,
      labSupplierId: labSupplierId || null,
      labReference: labReference || null,
      notes,
      confirm,
      idempotencyKey: key,
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Customer" subtitle="Orders always belong to a customer." />
          <CardBody>
            <CustomerPicker value={customer} onChange={setCustomer} branches={branches} canCreate={canCreateCustomer} required />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Items" subtitle="Frames are reserved when the order is confirmed. Prescription lenses are made to order — set the job price and lab cost here." />
          <div className="relative border-t border-line px-5 py-3">
            <Search className="pointer-events-none absolute top-1/2 left-8 size-4 -translate-y-1/2 text-text-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a frame, lens, case, service… (name or SKU)" className="pl-9" aria-label="Search products to add" />
            {matches.length ? (
              <ul className="absolute inset-x-5 top-full z-20 mt-1 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[var(--shadow-pop)]">
                {matches.map((m) => {
                  const out = m.productType === "stock" && m.available <= 0;
                  return (
                    <li key={m.variantId}>
                      <button
                        type="button"
                        disabled={out}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50"
                        onClick={() => {
                          setLines((ls) => [...ls, { variantId: m.variantId, qty: 1, priceCents: m.priceCents, costCents: m.costCents, prescriptionId: rx[0]?.id && m.productType === "made_to_order" ? rx[0].id : "" }]);
                          setQ("");
                        }}
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{m.productName}</span>
                          {m.label !== "Default" ? <span className="text-text-3"> · {m.label}</span> : null}
                          <span className="block font-mono text-[11px] text-text-3">{m.sku}</span>
                        </span>
                        <span className="shrink-0 text-right text-[12px]">
                          <span className="block font-medium tabular">{fmt(m.priceCents)}</span>
                          <span className="block text-text-3">{m.productType === "stock" ? (out ? "out of stock" : `${m.available} available`) : m.productType === "service" ? "service" : "made to order"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <p className="border-t border-line px-5 py-10 text-center text-[13px] text-text-3">Search above to add the frame and lenses.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {lines.map((l, i) => {
                const it = byId.get(l.variantId)!;
                const custom = it.productType === "made_to_order";
                return (
                  <li key={i} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">
                        {it.productName}
                        {it.label !== "Default" ? <span className="font-normal text-text-3"> · {it.label}</span> : null}
                      </p>
                      <p className="font-mono text-[11px] text-text-3">{it.sku}</p>
                      {custom && rx.length ? (
                        <Select aria-label="Prescription" value={l.prescriptionId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, prescriptionId: e.target.value } : x)))} className="mt-1.5 h-8 max-w-[360px] text-[12px]">
                          <option value="">No prescription attached</option>
                          {rx.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" min={1} max={it.productType === "stock" ? it.available : 99} aria-label="Quantity" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} className="h-8 w-16 text-right" />
                      {custom ? (
                        <>
                          <MoneyInput aria-label="Job price" value={l.priceCents} onValueChange={(c) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, priceCents: c } : x)))} className="w-32" />
                          {canSeeCost ? <MoneyInput aria-label="Lab cost" title="Lab cost" value={l.costCents} onValueChange={(c) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, costCents: c } : x)))} className="w-28" /> : null}
                        </>
                      ) : (
                        <span className="w-32 text-right text-[13px] font-medium tabular">{fmt(it.priceCents * l.qty)}</span>
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Fulfilment" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Branch"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                router.replace(`/app/orders/new?branch=${e.target.value}${customer ? `&customer=${customer.id}` : ""}`);
              }}
              hint={lines.length ? "Changing branch reloads stock availability and clears the items." : "Stock is reserved from this branch's stockroom."}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Promised pickup date" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            <SelectField label="Laboratory / supplier" value={labSupplierId} onChange={(e) => setLabSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Lab job reference" value={labReference} onChange={(e) => setLabReference(e.target.value)} />
            <TextareaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="sm:col-span-2" placeholder="Frame fit, lens coatings, special instructions…" />
          </CardBody>
        </Card>
      </div>
      <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader title="Summary" />
          <CardBody className="flex flex-col gap-3">
            <dl className="flex flex-col gap-1 text-[13px]">
              <div className="flex justify-between text-text-2">
                <dt>Subtotal</dt>
                <dd className="tabular">{fmt(priced?.subtotalCents ?? 0)}</dd>
              </div>
              <div className="flex justify-between text-text-2">
                <dt>
                  {tax.name} {tax.rateBps / 100}%{tax.pricesIncludeTax ? " (included)" : ""}
                </dt>
                <dd className="tabular">{fmt(priced?.taxCents ?? 0)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold">Order total</dt>
                <dd className="font-display text-[22px] font-semibold tabular">{fmt(total)}</dd>
              </div>
            </dl>
            <div className="rounded-[12px] border border-line p-3">
              <p className="mb-2 text-[12.5px] font-medium text-text-2">Deposit (optional)</p>
              <div className="flex gap-2">
                <Select aria-label="Deposit method" value={deposit.method} onChange={(e) => setDeposit((d) => ({ ...d, method: e.target.value as typeof d.method }))} className="h-9 flex-1 text-[12.5px]">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
                <MoneyInput aria-label="Deposit amount" value={deposit.amountCents} onValueChange={(c) => setDeposit((d) => ({ ...d, amountCents: c }))} className="w-32" />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setDeposit((d) => ({ ...d, amountCents: Math.round(total / 2 / 100) * 100 }))} disabled={!total}>
                  50%
                </Button>
                <Button size="sm" onClick={() => setDeposit((d) => ({ ...d, amountCents: total }))} disabled={!total}>
                  Full
                </Button>
              </div>
              {deposit.method !== "cash" && deposit.amountCents ? <Input aria-label="Reference" value={deposit.reference} onChange={(e) => setDeposit((d) => ({ ...d, reference: e.target.value }))} placeholder="Reference number" className="mt-2 h-8 text-[12.5px]" /> : null}
              {deposit.amountCents && total ? <p className="mt-2 text-[12.5px] text-text-2">Balance at pickup: {fmt(Math.max(0, total - deposit.amountCents))}</p> : null}
            </div>
            <Checkbox label="Confirm now" description="Reserves stocked items immediately." checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            {pricingError ? <p className="text-[12.5px] text-neg">{pricingError}</p> : null}
            <FormError message={save.error} />
            <Field label="">
              <Button variant="accent" size="lg" className="w-full justify-center rounded-full" loading={save.pending} disabled={!customer || !lines.length || Boolean(pricingError) || (deposit.amountCents ?? 0) > total} onClick={submit}>
                <Plus /> Create order
              </Button>
            </Field>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
