"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, FormError, Input, MoneyInput, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@/lib/schemas";
import { saveProductAction } from "./actions";

type Variant = {
  id?: string | null;
  sku: string;
  barcode: string;
  label: string;
  size: string;
  color: string;
  priceCents: number | null;
  costCents: number | null;
  reorderPoint: number;
  reorderQty: number;
  isActive: boolean;
  onHand?: number;
};

export type ProductFormInitial = {
  id?: string;
  name: string;
  brand: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  supplierId: string;
  productType: "stock" | "service" | "made_to_order";
  taxExempt: boolean;
  showOnWebsite: boolean;
  isActive: boolean;
  shape: string;
  material: string;
  variants: Variant[];
};

const blankVariant = (): Variant => ({ sku: "", barcode: "", label: "", size: "", color: "", priceCents: null, costCents: null, reorderPoint: 2, reorderQty: 5, isActive: true });

const IMAGES = [
  ["", "No image"],
  ["/products/frame-rectangle-black.svg", "Frame · rectangle"],
  ["/products/frame-round-tortoise.svg", "Frame · round"],
  ["/products/frame-square-black.svg", "Frame · square"],
  ["/products/frame-cateye-black.svg", "Frame · cat-eye"],
  ["/products/frame-aviator-gold.svg", "Frame · aviator"],
  ["/products/frame-oval-crystal.svg", "Frame · oval"],
  ["/products/frame-browline-black.svg", "Frame · browline"],
  ["/products/frame-hexagon-gold.svg", "Frame · hexagon"],
  ["/products/sun-aviator-green.svg", "Sunglasses · aviator"],
  ["/products/sun-square-smoke.svg", "Sunglasses · square"],
  ["/products/sun-round-brown.svg", "Sunglasses · round"],
  ["/products/contact-box.svg", "Contact lens box"],
  ["/products/solution-bottle.svg", "Solution bottle"],
  ["/products/case-hard.svg", "Case"],
  ["/products/cloth.svg", "Cloth / wipes"],
  ["/products/accessory.svg", "Accessory"],
  ["/products/rx-lens.svg", "Prescription lens"],
  ["/products/service-exam.svg", "Service"],
] as const;

export function ProductForm({
  initial,
  categories,
  suppliers,
  locations,
  canSeeCost,
}: {
  initial: ProductFormInitial;
  categories: { id: string; name: string; kind: string }[];
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  canSeeCost: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormInitial>(initial);
  const [opening, setOpening] = useState<Record<string, number>>({});
  const isNew = !initial.id;
  const save = useAction(saveProductAction, { onSuccess: (r) => router.push(`/app/products/${r.productId}`) });
  const set = <K extends keyof ProductFormInitial>(k: K, val: ProductFormInitial[K]) => setV((p) => ({ ...p, [k]: val }));
  const setVariant = (i: number, patch: Partial<Variant>) => setV((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const stock = v.productType === "stock";

  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    const missing = v.variants.findIndex((x) => x.priceCents === null);
    if (missing >= 0) {
      setLocalError(`Enter a price for variant ${v.variants[missing].sku || missing + 1}.`);
      return;
    }
    setLocalError(null);
    const payload = {
      name: v.name,
      brand: v.brand,
      description: v.description,
      imageUrl: v.imageUrl,
      categoryId: v.categoryId,
      supplierId: v.supplierId || null,
      productType: v.productType,
      taxExempt: v.taxExempt,
      showOnWebsite: v.showOnWebsite,
      isActive: v.isActive,
      attributes: Object.fromEntries(Object.entries({ shape: v.shape, material: v.material }).filter(([, x]) => x)),
      variants: v.variants.map((x) => ({
        id: x.id ?? null,
        sku: x.sku,
        barcode: x.barcode,
        label: x.label || [x.size, x.color].filter(Boolean).join(" · ") || "Default",
        options: Object.fromEntries(Object.entries({ size: x.size, color: x.color }).filter(([, y]) => y)),
        priceCents: x.priceCents ?? 0,
        costCents: x.costCents ?? 0,
        reorderPoint: x.reorderPoint,
        reorderQty: x.reorderQty,
        isActive: x.isActive,
      })),
    };
    const openingList = isNew && stock
      ? Object.entries(opening)
          .filter(([, q]) => q > 0)
          .map(([k, q]) => {
            const [vi, loc] = k.split("|");
            return { variantIndex: Number(vi), locationId: loc, quantity: q };
          })
      : [];
    save.run(initial.id ?? null, payload as never, openingList);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Product details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label="Product name" required value={v.name} onChange={(e) => set("name", e.target.value)} error={save.fe("name")} className="sm:col-span-2" autoFocus={isNew} />
            <TextField label="Brand" value={v.brand} onChange={(e) => set("brand", e.target.value)} />
            <SelectField label="Category" required value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} error={save.fe("categoryId")}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Inventory type"
              value={v.productType}
              onChange={(e) => set("productType", e.target.value as ProductFormInitial["productType"])}
              hint={v.productType === "made_to_order" ? "Ordered from the lab per job; never stocked. Price and lab cost can be set per order." : v.productType === "service" ? "Exams, fittings and repairs — no stock." : "Physical items counted in each branch's stockroom."}
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Preferred supplier" value={v.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Frame shape" value={v.shape} onChange={(e) => set("shape", e.target.value)} placeholder="e.g. round" />
            <TextField label="Material" value={v.material} onChange={(e) => set("material", e.target.value)} placeholder="e.g. acetate" />
            <TextareaField label="Description" value={v.description} onChange={(e) => set("description", e.target.value)} className="sm:col-span-2" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Visibility & tax" />
          <CardBody className="flex flex-col gap-4">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#efeee8]">
              {v.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[12px] text-text-3">No image</span>
              )}
            </div>
            <SelectField label="Illustration" value={IMAGES.some(([u]) => u === v.imageUrl) ? v.imageUrl : "custom"} onChange={(e) => e.target.value !== "custom" && set("imageUrl", e.target.value)}>
              {IMAGES.map(([u, l]) => (
                <option key={u} value={u}>
                  {l}
                </option>
              ))}
              {!IMAGES.some(([u]) => u === v.imageUrl) ? <option value="custom">Custom URL</option> : null}
            </SelectField>
            <TextField label="…or image URL" value={v.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} error={save.fe("imageUrl")} placeholder="https://…" />
            <Checkbox label="Show on website" description="Listed on the public eyewear page." checked={v.showOnWebsite} onChange={(e) => set("showOnWebsite", e.target.checked)} />
            <Checkbox label="Tax exempt" description="No VAT charged on this item." checked={v.taxExempt} onChange={(e) => set("taxExempt", e.target.checked)} />
            <Checkbox label="Active" description="Inactive products can't be sold." checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Variants"
          subtitle="Each size/colour combination has its own SKU, price and stock."
          actions={
            <Button size="sm" onClick={() => set("variants", [...v.variants, blankVariant()])}>
              <Plus /> Add variant
            </Button>
          }
        />
        <div className="scroll-thin overflow-x-auto border-t border-line">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas/70 text-left">
                {["SKU", "Barcode", "Size", "Colour / label", "Price", canSeeCost ? (stock ? "Cost (avg)" : "Cost") : null, stock ? "Reorder at" : null, stock ? "Reorder qty" : null, "Active", ""].filter(Boolean).map((h) => (
                  <th key={h as string} className="h-9 px-2 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.variants.map((x, i) => (
                <tr key={x.id ?? `new-${i}`} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 pl-5">
                    <Input aria-label="SKU" value={x.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} className="h-8 w-36 font-mono text-[12px]" required aria-invalid={save.fe(`variants.${i}.sku`) ? true : undefined} />
                  </td>
                  <td className="px-2 py-2">
                    <Input aria-label="Barcode" value={x.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value })} className="h-8 w-32" />
                  </td>
                  <td className="px-2 py-2">
                    <Input aria-label="Size" value={x.size} onChange={(e) => setVariant(i, { size: e.target.value })} className="h-8 w-20" />
                  </td>
                  <td className="px-2 py-2">
                    <Input aria-label="Colour or label" value={x.color || x.label} onChange={(e) => setVariant(i, { color: e.target.value, label: "" })} className="h-8 w-36" />
                  </td>
                  <td className="px-2 py-2">
                    <MoneyInput aria-label="Price" value={x.priceCents} onValueChange={(c) => setVariant(i, { priceCents: c })} className="w-32" />
                  </td>
                  {canSeeCost ? (
                    <td className="px-2 py-2">
                      <MoneyInput aria-label="Cost" value={x.costCents} onValueChange={(c) => setVariant(i, { costCents: c })} className="w-32" disabled={stock && !isNew && (x.onHand ?? 0) > 0} title={stock && (x.onHand ?? 0) > 0 ? "Maintained automatically from stock receipts (weighted average)." : undefined} />
                    </td>
                  ) : null}
                  {stock ? (
                    <>
                      <td className="px-2 py-2">
                        <Input aria-label="Reorder point" type="number" min={0} value={x.reorderPoint} onChange={(e) => setVariant(i, { reorderPoint: Number(e.target.value) })} className="h-8 w-20 text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <Input aria-label="Reorder quantity" type="number" min={0} value={x.reorderQty} onChange={(e) => setVariant(i, { reorderQty: Number(e.target.value) })} className="h-8 w-20 text-right" />
                      </td>
                    </>
                  ) : null}
                  <td className="px-2 py-2">
                    <input type="checkbox" aria-label="Active" checked={x.isActive} onChange={(e) => setVariant(i, { isActive: e.target.checked })} className="size-4 accent-[var(--ink)]" />
                  </td>
                  <td className="px-2 py-2 pr-5 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label="Remove variant" disabled={v.variants.length === 1} onClick={() => set("variants", v.variants.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isNew ? <p className="border-t border-line px-5 py-2.5 text-[12px] text-text-3">Removing a variant archives it (it stays on past sales). Variants with stock on hand can&apos;t be removed.</p> : null}
      </Card>

      {isNew && stock && locations.length ? (
        <Card>
          <CardHeader title="Opening stock" subtitle="Optional. Recorded as an “Opening stock” movement at the cost above — never a silent number." />
          <div className="scroll-thin overflow-x-auto border-t border-line">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-left">
                  <th className="h-9 px-5 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase">Variant</th>
                  {locations.map((l) => (
                    <th key={l.id} className="h-9 px-3 text-right text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase">
                      {l.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.variants.map((x, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 font-mono text-[12px]">{x.sku || `Variant ${i + 1}`}</td>
                    {locations.map((l) => (
                      <td key={l.id} className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          aria-label={`Opening stock at ${l.name}`}
                          value={opening[`${i}|${l.id}`] ?? ""}
                          onChange={(e) => setOpening((o) => ({ ...o, [`${i}|${l.id}`]: Math.max(0, Number(e.target.value)) }))}
                          className="ml-auto h-8 w-24 text-right"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className={cn("sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8")}>
        <div className="min-w-0 flex-1">
          <FormError message={localError ?? save.error} />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.pending}>
            {isNew ? "Create product" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

