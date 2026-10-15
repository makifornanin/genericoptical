import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Kpi } from "@/components/app/kpi";
import { CardsSkeleton, Forbidden, PageBody } from "@/components/app/page";
import { PoStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyRow, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { AppError, can } from "@/server/services/core";
import { getSupplier } from "@/server/services/purchasing";
import { ArchiveSupplierButton, EditSupplierButton } from "../supplier-form";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "suppliers.view")) return <Forbidden what="suppliers" />;
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSupplier>>;
  try {
    data = await getSupplier(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const f = formatter(session.business);
  const s = data.supplier;
  const received = data.purchaseOrders.reduce((a, p) => a + p.receivedValueCents, 0);
  const open = data.purchaseOrders.filter((p) => ["draft", "ordered", "partially_received"].includes(p.status));
  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div>
          <Link href="/app/suppliers" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> Suppliers
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold">{s.name}</h1>
            <Pill>{s.code}</Pill>
            {s.archivedAt ? <Pill>Archived</Pill> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "purchasing.manage") && !s.archivedAt ? (
            <ButtonLink href={`/app/purchase-orders/new?supplier=${s.id}`} variant="primary">
              <Plus /> New purchase order
            </ButtonLink>
          ) : null}
          {can(ctx, "suppliers.manage") ? (
            <>
              <EditSupplierButton
                id={s.id}
                initial={{ code: s.code, name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "", paymentTerms: s.paymentTerms ?? "", leadTimeDays: s.leadTimeDays?.toString() ?? "", notes: s.notes ?? "" }}
              />
              <ArchiveSupplierButton id={s.id} archived={Boolean(s.archivedAt)} />
            </>
          ) : null}
        </div>
      </header>
      <PageBody>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi inverted label="Received value" value={f.money(received)} caption="all purchase orders" />
          <Kpi label="Purchase orders" value={String(data.purchaseOrders.length)} caption={`${open.length} open`} />
          <Kpi label="Products supplied" value={String(data.products.length)} />
          <Kpi label="Lead time" value={s.leadTimeDays !== null ? `${s.leadTimeDays} days` : "—"} caption={s.paymentTerms ?? undefined} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Purchase history" />
            <TableWrap>
              <Table>
                <THead>
                  <TH>PO</TH>
                  <TH>Status</TH>
                  <TH align="right">Ordered value</TH>
                  <TH align="right">Received value</TH>
                  <TH align="right">Created</TH>
                </THead>
                <tbody>
                  {data.purchaseOrders.length === 0 ? <EmptyRow colSpan={5}>No purchase orders yet.</EmptyRow> : null}
                  {data.purchaseOrders.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">
                        <Link href={`/app/purchase-orders/${p.id}`} className="hover:underline">
                          {p.number}
                        </Link>
                      </TD>
                      <TD>
                        <PoStatusPill status={p.status} />
                      </TD>
                      <TD align="right">{f.money(p.subtotalCents)}</TD>
                      <TD align="right" className="font-medium">
                        {f.money(p.receivedValueCents)}
                      </TD>
                      <TD align="right" className="text-text-2">
                        {f.date(p.createdAt)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Contact" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Contact", value: s.contactName ?? "—" },
                    { label: "Email", value: s.email ?? "—" },
                    { label: "Phone", value: s.phone ?? "—" },
                    { label: "Address", value: s.address ?? "—" },
                  ]}
                />
                {s.notes ? <p className="mt-3 text-[13px] text-text-2">{s.notes}</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Products" />
              <ul className="divide-y divide-line border-t border-line">
                {data.products.slice(0, 15).map((p) => (
                  <li key={p.id} className="px-5 py-2 text-[13px]">
                    <Link href={`/app/products/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                    {p.brand ? <span className="text-text-3"> · {p.brand}</span> : null}
                  </li>
                ))}
                {data.products.length === 0 ? <li className="px-5 py-3 text-[13px] text-text-3">No products linked.</li> : null}
              </ul>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default function SupplierPage(props: PageProps<"/app/suppliers/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
