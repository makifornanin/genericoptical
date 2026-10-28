import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden, PageBody } from "@/components/app/page";
import { PoStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { purchasableVariants } from "@/server/services/catalog";
import { AppError, can } from "@/server/services/core";
import { listLocations } from "@/server/services/inventory";
import { getPurchaseOrder, listSuppliers } from "@/server/services/purchasing";
import { PoForm } from "../po-form";
import { PoActions, ReceiveDialog } from "./receive";

async function Content({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "purchasing.view")) return <Forbidden what="purchase orders" />;
  const { id } = await params;
  const sp = await searchParams;
  let data: Awaited<ReturnType<typeof getPurchaseOrder>>;
  try {
    data = await getPurchaseOrder(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const f = formatter(session.business);
  const po = data.po;

  if (sp.edit === "1" && po.status === "draft" && can(ctx, "purchasing.manage")) {
    const [suppliers, locations, variants] = await Promise.all([listSuppliers(ctx, { pageSize: 100 }), listLocations(ctx), purchasableVariants(ctx)]);
    return (
      <>
        <header className="px-4 pt-5 pb-4 sm:px-6 lg:px-8 lg:pt-7">
          <Link href={`/app/purchase-orders/${po.id}`} className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> {po.number}
          </Link>
          <h1 className="font-display text-[26px] font-semibold">Edit {po.number}</h1>
        </header>
        <PageBody>
          <PoForm
            id={po.id}
            suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
            locations={locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }))}
            variants={variants}
            currency={session.business.currency}
            locale={session.business.locale}
            initial={{ supplierId: po.supplierId, locationId: po.locationId, expectedOn: po.expectedOn ?? "", notes: po.notes ?? "", items: data.items.map((i) => ({ variantId: i.item.variantId, quantity: i.item.quantityOrdered, unitCostCents: i.item.unitCostCents })) }}
          />
        </PageBody>
      </>
    );
  }

  const ordered = data.items.reduce((s, i) => s + i.item.quantityOrdered, 0);
  const received = data.items.reduce((s, i) => s + i.item.quantityReceived, 0);
  const canReceive = can(ctx, "inventory.receive") && (po.status === "ordered" || po.status === "partially_received");

  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div>
          <Link href="/app/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> Purchase orders
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold">{po.number}</h1>
            <PoStatusPill status={po.status} />
          </div>
          <p className="text-[13px] text-text-2">
            {data.supplier.name} → {data.locationName} · {received} of {ordered} units received
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.status === "draft" && can(ctx, "purchasing.manage") ? (
            <ButtonLink href={`/app/purchase-orders/${po.id}?edit=1`}>
              <Pencil /> Edit draft
            </ButtonLink>
          ) : null}
          <PoActions id={po.id} status={po.status} canApprove={can(ctx, "purchasing.approve")} canManage={can(ctx, "purchasing.manage")} />
          {canReceive ? (
            <ReceiveDialog
              poId={po.id}
              items={data.items.map((i) => ({ id: i.item.id, name: `${i.productName} · ${i.label}`, sku: i.sku, ordered: i.item.quantityOrdered, received: i.item.quantityReceived }))}
            />
          ) : null}
        </div>
      </header>
      <PageBody>
        {po.status === "draft" ? (
          <p className="rounded-[12px] border border-line bg-surface px-4 py-3 text-[13px] text-text-2">
            Draft — {can(ctx, "purchasing.approve") ? "confirm it with the supplier when it's ready." : "waiting for a manager to confirm it with the supplier."} Stock can only be received on confirmed orders.
          </p>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Items" />
            <TableWrap>
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Unit cost</TH>
                  <TH align="right">Line total</TH>
                </THead>
                <tbody>
                  {data.items.map((i) => (
                    <TR key={i.item.id}>
                      <TD>
                        <Link href={`/app/products/${i.productId}`} className="font-medium hover:underline">
                          {i.productName}
                        </Link>
                        <span className="text-text-3"> · {i.label}</span>
                        <div className="font-mono text-[11px] text-text-3">{i.sku}</div>
                      </TD>
                      <TD align="right">{i.item.quantityOrdered}</TD>
                      <TD align="right" className={i.item.quantityReceived >= i.item.quantityOrdered ? "font-medium text-pos" : undefined}>
                        {i.item.quantityReceived}
                      </TD>
                      <TD align="right">{f.money(i.item.unitCostCents)}</TD>
                      <TD align="right" className="font-medium">
                        {f.money(i.item.unitCostCents * i.item.quantityOrdered)}
                      </TD>
                    </TR>
                  ))}
                  <TR>
                    <TD colSpan={4} align="right" className="font-medium">
                      Order total
                    </TD>
                    <TD align="right" className="text-[15px] font-semibold">
                      {f.money(po.subtotalCents)}
                    </TD>
                  </TR>
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Supplier", value: <Link href={`/app/suppliers/${data.supplier.id}`} className="underline">{data.supplier.name}</Link> },
                    { label: "Contact", value: data.supplier.contactName ?? "—" },
                    { label: "Payment terms", value: data.supplier.paymentTerms ?? "—" },
                    { label: "Ordered", value: po.orderedAt ? f.date(po.orderedAt) : "Not yet" },
                    { label: "Expected", value: po.expectedOn ? f.date(po.expectedOn) : "—" },
                    { label: "Fully received", value: po.receivedAt ? f.date(po.receivedAt) : "—" },
                  ]}
                />
                {po.notes ? <p className="mt-3 rounded-[10px] bg-surface-2 p-3 text-[13px] text-text-2">{po.notes}</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Receiving history" />
              {data.receipts.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-3">Nothing received yet.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {data.receipts.map((r) => (
                    <li key={r.receipt.id} className="px-5 py-2.5 text-[13px]">
                      <p className="font-medium">{r.units} unit(s) received</p>
                      <p className="text-[12px] text-text-3">
                        {f.dateTime(r.receipt.receivedAt)} · {r.receivedByName ?? "—"}
                      </p>
                      {r.receipt.notes ? <p className="mt-1 text-[12.5px] text-text-2">{r.receipt.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="History" />
              <ul className="divide-y divide-line border-t border-line">
                {data.history.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <p className="text-[12.5px]">{h.summary}</p>
                    <p className="text-[11.5px] text-text-3">
                      {h.actorLabel} · {f.dateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default function PurchaseOrderPage(props: PageProps<"/app/purchase-orders/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
