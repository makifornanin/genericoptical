"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormError, Input, MoneyInput, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { savePoAction } from "./actions";

export type PoVariant = { variantId: string; productName: string; label: string; sku: string; costCents: number; supplierId: string | null; byLocation: Record<string, number>; reorderPoint: number };
type Line = { variantId: string; quantity: number; unitCostCents: number | null };

export function PoForm({
  id,
  suppliers,
  locations,
  variants,
  initial,
  currency,
  locale,
}: {
  id?: string;
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  variants: PoVariant[];
  initial?: { supplierId: string; locationId: string; expectedOn: string; notes: string; items: Line[] };
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [expectedOn, setExpectedOn] = useState(initial?.expectedOn ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.items ?? []);
  const [q, setQ] = useState("");
  const save = useAction(savePoAction, { onSuccess: (r) => router.push(`/app/purchase-orders/${r.purchaseOrderId}`) });
  const byId = useMemo(() => new Map(variants.map((v) => [v.variantId, v])), [variants]);
  const avail = (v: PoVariant) => v.byLocation[locationId] ?? 0;
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return variants
      .filter((v) => !lines.some((l) => l.variantId === v.variantId))
      .filter((v) => (supplierId ? v.supplierId === supplierId || !v.supplierId : true))
      .filter((v) => !term || `${v.productName} ${v.label} ${v.sku}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [variants, q, lines, supplierId]);
  const total = lines.reduce((s, l) => s + l.quantity * (l.unitCostCents ?? 0), 0);
  const suggest = () => {
    const low = variants.filter((v) => (!supplierId || v.supplierId === supplierId) && avail(v) <= v.reorderPoint && !lines.some((l) => l.variantId === v.variantId));
    setLines((ls) => [...ls, ...low.map((v) => ({ variantId: v.variantId, quantity: Math.max(1, v.reorderPoint * 2 + 2 - Math.max(0, avail(v))), unitCostCents: v.costCents }))]);
  };
  const submit = () => save.run(id ?? null, { supplierId, locationId, expectedOn, notes, items: lines.map((l) => ({ ...l, unitCostCents: l.unitCostCents ?? 0 })) });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Order details" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={save.fe("supplierId")}>
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Deliver to" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Expected delivery" type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
          <TextareaField label="Notes for the supplier" value={notes} onChange={(e) => setNotes(e.target.value)} className="sm:col-span-3" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Items"
          subtitle="Stocked items only. Cost defaults to the current weighted-average cost."
          actions={
            <Button size="sm" onClick={suggest} disabled={!supplierId}>
              Add low-stock items
            </Button>
          }
        />
        <div className="relative border-t border-line px-5 py-3">
          <Search className="pointer-events-none absolute top-1/2 left-8 size-4 -translate-y-1/2 text-text-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={supplierId ? "Search this supplier's products by name or SKU…" : "Search products by name or SKU…"} className="pl-9" aria-label="Search products to add" />
          {q && matches.length ? (
            <ul className="absolute inset-x-5 top-full z-20 mt-1 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[var(--shadow-pop)]">
              {matches.map((v) => (
                <li key={v.variantId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                    onClick={() => {
                      setLines((ls) => [...ls, { variantId: v.variantId, quantity: Math.max(1, v.reorderPoint * 2), unitCostCents: v.costCents }]);
                      setQ("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{v.productName}</span> <span className="text-text-3">· {v.label}</span>
                      <span className="block font-mono text-[11px] text-text-3">{v.sku}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-text-2">{avail(v)} available here</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-canvas/70 text-left">
                {["Product", "Qty", "Unit cost", "Line total", ""].map((h, i) => (
                  <th key={h + i} className={`h-9 px-3 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase first:pl-5 last:pr-5 ${i > 0 && i < 4 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-text-3">
                    Search above to add items, or add everything that&apos;s low on stock.
                  </td>
                </tr>
              ) : null}
              {lines.map((l, i) => {
                const v = byId.get(l.variantId);
                return (
                  <tr key={l.variantId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 pl-5">
                      <span className="font-medium">{v?.productName}</span> <span className="text-text-3">· {v?.label}</span>
                      <div className="font-mono text-[11px] text-text-3">{v?.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input type="number" min={1} aria-label="Quantity" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))} className="ml-auto h-8 w-20 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <MoneyInput aria-label="Unit cost" value={l.unitCostCents} onValueChange={(c) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCostCents: c } : x)))} className="ml-auto w-32" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular">{formatMoney(l.quantity * (l.unitCostCents ?? 0), currency, locale)}</td>
                    <td className="px-3 py-2 pr-5 text-right">
                      <Button variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-[13px] text-text-2">{lines.length} line(s)</span>
          <span className="text-[15px] font-semibold tabular">{formatMoney(total, currency, locale)}</span>
        </div>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FormError message={save.error} />
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="primary" loading={save.pending} disabled={!supplierId || !lines.length} onClick={submit}>
          <Plus /> {id ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </div>
  );
}
