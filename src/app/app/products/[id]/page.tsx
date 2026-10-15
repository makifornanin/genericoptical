import { Archive, ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden, PageBody } from "@/components/app/page";
import { StockPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyRow, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { PRODUCT_TYPE_LABELS } from "@/lib/schemas";
import { requireSession } from "@/server/auth/session";
import { getProduct, listCategories } from "@/server/services/catalog";
import { AppError, can } from "@/server/services/core";
import { listLocations, listMovements, MOVEMENT_LABELS, variantBalances } from "@/server/services/inventory";
import { listSuppliers } from "@/server/services/purchasing";
import { AdjustStockDialog, TransferStockDialog } from "../../inventory/dialogs";
import { ProductForm } from "../product-form";
import { ArchiveProductButton } from "./archive-button";

async function Content({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "products.view")) return <Forbidden what="products" />;
  const { id } = await params;
  const sp = await searchParams;
  let data: Awaited<ReturnType<typeof getProduct>>;
  try {
    data = await getProduct(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const f = formatter(session.business);
  const p = data.product;
  const manage = can(ctx, "products.manage");
  const stock = p.productType === "stock";

  if (sp.edit === "1" && manage && !p.archivedAt) {
    const [categories, suppliers] = await Promise.all([listCategories(ctx), can(ctx, "suppliers.view") ? listSuppliers(ctx, { pageSize: 100 }) : Promise.resolve({ rows: [] as { id: string; name: string }[] })]);
    return (
      <>
        <header className="px-4 pt-5 pb-4 sm:px-6 lg:px-8 lg:pt-7">
          <Link href={`/app/products/${p.id}`} className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> Back to product
          </Link>
          <h1 className="font-display text-[26px] font-semibold">Edit {p.name}</h1>
        </header>
        <PageBody>
          <ProductForm
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
            locations={[]}
            canSeeCost={can(ctx, "products.costs")}
            initial={{
              id: p.id,
              name: p.name,
              brand: p.brand ?? "",
              description: p.description ?? "",
              imageUrl: p.imageUrl ?? "",
              categoryId: p.categoryId,
              supplierId: p.supplierId ?? "",
              productType: p.productType,
              taxExempt: p.taxExempt,
              showOnWebsite: p.showOnWebsite,
              isActive: p.isActive,
              shape: p.attributes.shape ?? "",
              material: p.attributes.material ?? "",
              variants: data.variants
                .filter((v) => !v.archivedAt)
                .map((v) => ({
                  id: v.id,
                  sku: v.sku,
                  barcode: v.barcode ?? "",
                  label: v.options.color || v.options.size ? "" : v.label,
                  size: v.options.size ?? "",
                  color: v.options.color ?? (v.options.size ? "" : ""),
                  priceCents: v.priceCents,
                  costCents: v.costCents,
                  reorderPoint: v.reorderPoint,
                  reorderQty: v.reorderQty,
                  isActive: v.isActive,
                  onHand: v.onHand,
                })),
            }}
          />
        </PageBody>
      </>
    );
  }

  const active = data.variants.filter((v) => !v.archivedAt);
  const [balances, movements, locations] = await Promise.all([
    stock && can(ctx, "inventory.view") ? Promise.all(active.map((v) => variantBalances(ctx, v.id).then((b) => [v.id, b] as const))) : Promise.resolve([]),
    stock && can(ctx, "inventory.view") ? listMovements(ctx, { productId: p.id, pageSize: 12 }) : Promise.resolve(null),
    listLocations(ctx),
  ]);
  const balMap = new Map(balances);
  const activeLocations = locations.filter((l) => l.isActive);

  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div className="flex items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#efeee8]">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </span>
          <div>
            <Link href="/app/products" className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
              <ArrowLeft className="size-3.5" /> Products
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[26px] font-semibold">{p.name}</h1>
              {p.archivedAt ? <Pill>Archived</Pill> : !p.isActive ? <Pill>Inactive</Pill> : null}
              {p.showOnWebsite ? <Pill tone="accent">In online store</Pill> : null}
            </div>
            <p className="text-[13px] text-text-2">
              {[p.brand, data.categoryName, PRODUCT_TYPE_LABELS[p.productType]].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            {!p.archivedAt ? (
              <ButtonLink href={`/app/products/${p.id}?edit=1`} variant="primary">
                <Pencil /> Edit product
              </ButtonLink>
            ) : null}
            <ArchiveProductButton id={p.id} archived={Boolean(p.archivedAt)} icon={p.archivedAt ? <RotateCcw /> : <Archive />} />
          </div>
        ) : null}
      </header>
      <PageBody>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Variants" subtitle={stock ? "Stock is per branch stockroom. Available = on hand − reserved for orders." : "Not stock-tracked."} />
            <TableWrap>
              <Table>
                <THead>
                  <TH>Variant</TH>
                  <TH>SKU</TH>
                  <TH align="right">Price</TH>
                  {can(ctx, "products.costs") ? <TH align="right">Avg. cost</TH> : null}
                  {stock ? (
                    <>
                      <TH align="right">On hand</TH>
                      <TH align="right">Reserved</TH>
                      <TH align="right">Available</TH>
                      <TH>Status</TH>
                    </>
                  ) : null}
                  <TH align="right">Sold</TH>
                  {stock && can(ctx, "inventory.adjust") ? <TH align="right">Actions</TH> : null}
                </THead>
                <tbody>
                  {active.map((v) => {
                    const b = balMap.get(v.id) ?? [];
                    return (
                      <TR key={v.id}>
                        <TD>
                          <span className="font-medium">{v.label}</span>
                          {!v.isActive ? <span className="ml-2 text-[11.5px] text-text-3">inactive</span> : null}
                          {stock && b.length > 1 ? (
                            <div className="mt-0.5 text-[11.5px] text-text-3">{b.map((x) => `${x.locationName.replace(" stockroom", "")}: ${x.available}`).join(" · ")}</div>
                          ) : null}
                        </TD>
                        <TD className="font-mono text-[12px] text-text-2">{v.sku}</TD>
                        <TD align="right">{f.money(v.priceCents)}</TD>
                        {can(ctx, "products.costs") ? <TD align="right" className="text-text-2">{v.costCents === null ? "—" : f.money(v.costCents)}</TD> : null}
                        {stock ? (
                          <>
                            <TD align="right">{v.onHand}</TD>
                            <TD align="right" className="text-text-2">{v.reserved || "—"}</TD>
                            <TD align="right" className="font-medium">{v.available}</TD>
                            <TD>
                              <StockPill available={Math.min(...(b.length ? b.map((x) => x.available) : [v.available]))} reorderPoint={v.reorderPoint} />
                            </TD>
                          </>
                        ) : null}
                        <TD align="right">{v.sold}</TD>
                        {stock && can(ctx, "inventory.adjust") ? (
                          <TD align="right">
                            <div className="flex justify-end gap-1.5">
                              <AdjustStockDialog variantId={v.id} label={`${p.name} · ${v.label} (${v.sku})`} locations={b.map((x) => ({ id: x.locationId, name: x.locationName, onHand: x.onHand, reserved: x.reserved }))} />
                              {can(ctx, "inventory.transfer") ? <TransferStockDialog variantId={v.id} label={`${p.name} · ${v.label}`} locations={b.map((x) => ({ id: x.locationId, name: x.locationName, onHand: x.onHand, reserved: x.reserved }))} /> : null}
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Category", value: data.categoryName },
                  { label: "Supplier", value: data.supplierName ?? "—" },
                  { label: "Tax", value: p.taxExempt ? "Exempt" : `${session.business.taxName} ${session.business.taxRateBps / 100}%` },
                  ...Object.entries(p.attributes).map(([k, val]) => ({ label: k[0].toUpperCase() + k.slice(1), value: val })),
                  { label: "Locations", value: stock ? activeLocations.length : "—" },
                  { label: "Updated", value: f.dateTime(p.updatedAt) },
                ]}
              />
              {p.description ? <p className="mt-3 text-[13px] text-text-2">{p.description}</p> : null}
            </CardBody>
          </Card>
        </div>
        {movements ? (
          <Card>
            <CardHeader title="Recent stock movements" actions={<ButtonLink href={`/app/inventory?tab=movements&product=${p.id}`} variant="ghost" size="sm">Full history</ButtonLink>} />
            <TableWrap>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Variant</TH>
                  <TH>Location</TH>
                  <TH align="right">Change</TH>
                  <TH align="right">On hand after</TH>
                  <TH>Reason</TH>
                </THead>
                <tbody>
                  {movements.rows.length === 0 ? <EmptyRow colSpan={7}>No movements yet.</EmptyRow> : null}
                  {movements.rows.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-text-2">{f.dateTime(m.createdAt)}</TD>
                      <TD>{MOVEMENT_LABELS[m.type] ?? m.type}</TD>
                      <TD className="font-mono text-[12px]">{m.sku}</TD>
                      <TD className="text-text-2">{m.locationName}</TD>
                      <TD align="right" className={m.quantity > 0 ? "font-medium text-pos" : "font-medium"}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </TD>
                      <TD align="right">{m.onHandAfter}</TD>
                      <TD className="max-w-[280px] truncate text-text-2">{m.reason ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}

export default function ProductPage(props: PageProps<"/app/products/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
