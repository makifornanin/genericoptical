import { ArrowLeft, Mail, MapPin, Phone, ScanBarcode, PackagePlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Kpi } from "@/components/app/kpi";
import { CardsSkeleton, Forbidden, PageBody } from "@/components/app/page";
import { AppointmentPill, FulfillmentPill, PaymentPill, SaleStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { EmptyRow, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { practitioners } from "@/server/services/appointments";
import { AppError, can } from "@/server/services/core";
import { getCustomer } from "@/server/services/customers";
import { ArchiveCustomerButton, EditCustomerButton, PrescriptionDialog } from "../forms";

const fmtRx = (v: string | number | null) => (v === null || v === undefined || v === "" ? "—" : Number(v) > 0 ? `+${Number(v).toFixed(2)}` : Number(v).toFixed(2));

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "customers.view")) return <Forbidden what="customers" />;
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getCustomer>>;
  try {
    data = await getCustomer(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const f = formatter(session.business);
  const c = data.customer;
  const { branches } = await getBranchContext(session.business.id);
  const staff = can(ctx, "prescriptions.manage") ? await practitioners(getDb(), session.business.id) : [];
  const openOrders = data.sales.filter((s) => s.kind === "order" && s.status === "open");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.business.timezone }).format(new Date());

  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div>
          <Link href="/app/customers" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> Customers
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold">
              {c.firstName} {c.lastName}
            </h1>
            <Pill>{c.code}</Pill>
            {c.archivedAt ? <Pill tone="neutral">Archived</Pill> : c.status === "inactive" ? <Pill tone="neutral">Inactive</Pill> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
            {c.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5 text-text-3" /> {c.phone}
              </span>
            ) : null}
            {c.email ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5 text-text-3" /> {c.email}
              </span>
            ) : null}
            {data.homeBranchName ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-text-3" /> {data.homeBranchName}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "pos.use") && !c.archivedAt ? (
            <ButtonLink href={`/app/pos?customer=${c.id}`}>
              <ScanBarcode /> New sale
            </ButtonLink>
          ) : null}
          {can(ctx, "orders.manage") && !c.archivedAt ? (
            <ButtonLink href={`/app/orders/new?customer=${c.id}`}>
              <PackagePlus /> New order
            </ButtonLink>
          ) : null}
          {can(ctx, "customers.manage") ? (
            <>
              <EditCustomerButton
                id={c.id}
                branches={branches}
                initial={{
                  firstName: c.firstName,
                  lastName: c.lastName,
                  email: c.email ?? "",
                  phone: c.phone ?? "",
                  birthDate: c.birthDate ?? "",
                  gender: c.gender ?? "",
                  addressLine1: c.addressLine1 ?? "",
                  city: c.city ?? "",
                  notes: c.notes ?? "",
                  source: c.source ?? "walk_in",
                  status: c.status,
                  homeBranchId: c.homeBranchId ?? "",
                  marketingConsent: c.marketingConsent,
                  smsConsent: c.smsConsent,
                }}
              />
              <ArchiveCustomerButton id={c.id} archived={Boolean(c.archivedAt)} />
            </>
          ) : null}
        </div>
      </header>
      <PageBody>
        {can(ctx, "sales.view") ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi inverted label="Lifetime value" value={f.money(data.stats.lifetimeCents)} caption={`${data.stats.visits} completed purchase(s)`} definition="Total charged on completed sales and handed-over orders, less refunds." />
            <Kpi label="Outstanding balance" value={f.money(data.stats.balanceCents)} caption={data.stats.balanceCents > 0 ? "owed across sales and orders" : "nothing owed"} />
            <Kpi label="Average purchase" value={f.money(data.stats.avgOrderCents)} caption={data.stats.firstPurchase ? `since ${f.date(data.stats.firstPurchase, "MMM yyyy")}` : "no purchases yet"} />
            <Kpi label="Open orders" value={String(data.stats.openOrders)} caption={data.stats.lastPurchase ? `last visit ${f.relative(data.stats.lastPurchase)}` : undefined} />
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            {openOrders.length ? (
              <Card>
                <CardHeader title="Open orders" subtitle="In progress — not yet handed over" />
                <ul className="divide-y divide-line border-t border-line">
                  {openOrders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/app/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-medium">
                            {o.number} <span className="font-normal text-text-2">· {o.items}</span>
                          </p>
                          <p className="text-[12px] text-text-3">
                            {o.dueOn ? `Due ${f.date(o.dueOn)}` : "No due date"} · {f.money(o.balanceDueCents)} balance
                          </p>
                        </div>
                        <FulfillmentPill stage={o.fulfillmentStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {can(ctx, "sales.view") ? (
              <Card>
                <CardHeader title="Purchase history" subtitle="Sales and orders, newest first" />
                <TableWrap>
                  <Table>
                    <THead>
                      <TH>Number</TH>
                      <TH>Items</TH>
                      <TH>Status</TH>
                      <TH align="right">Total</TH>
                      <TH>Payment</TH>
                      <TH align="right">Date</TH>
                    </THead>
                    <tbody>
                      {data.sales.length === 0 ? <EmptyRow colSpan={6}>No purchases yet.</EmptyRow> : null}
                      {data.sales.map((s) => (
                        <TR key={s.id}>
                          <TD className="font-medium">
                            <Link href={s.kind === "order" ? `/app/orders/${s.id}` : `/app/sales/${s.id}`} className="hover:underline">
                              {s.number}
                            </Link>
                          </TD>
                          <TD className="max-w-[260px] truncate text-text-2">{s.items}</TD>
                          <TD>{s.kind === "order" && s.status === "open" ? <FulfillmentPill stage={s.fulfillmentStatus} /> : <SaleStatusPill status={s.status} />}</TD>
                          <TD align="right" className="font-medium">
                            {f.money(s.totalCents)}
                          </TD>
                          <TD>{s.status !== "cancelled" ? <PaymentPill status={s.paymentStatus} refunded={s.refundedCents} total={s.totalCents} /> : null}</TD>
                          <TD align="right" className="text-text-2">
                            {f.date(s.completedAt ?? s.createdAt)}
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </Card>
            ) : null}

            {data.prescriptions ? (
              <Card>
                <CardHeader
                  title="Prescriptions"
                  subtitle="Clinical records · restricted access"
                  actions={can(ctx, "prescriptions.manage") ? <PrescriptionDialog customerId={c.id} practitioners={staff} today={today} /> : null}
                />
                {data.prescriptions.length === 0 ? (
                  <EmptyState title="No prescriptions recorded" />
                ) : (
                  <TableWrap>
                    <Table>
                      <THead>
                        <TH>Date</TH>
                        <TH>Eye</TH>
                        <TH align="right">Sphere</TH>
                        <TH align="right">Cylinder</TH>
                        <TH align="right">Axis</TH>
                        <TH align="right">Add</TH>
                        <TH align="right">PD</TH>
                        <TH>Practitioner</TH>
                      </THead>
                      <tbody>
                        {data.prescriptions.map(({ rx, practitionerName }) =>
                          (["OD", "OS"] as const).map((eye, i) => (
                            <TR key={rx.id + eye} className={i === 0 ? "border-b-0" : undefined}>
                              <TD className={i === 1 ? "text-transparent" : "font-medium"}>
                                {i === 0 ? (
                                  <>
                                    {f.date(rx.examinedOn)}
                                    <div className="text-[11.5px] font-normal text-text-3">{rx.kind === "contact_lens" ? "Contact lens" : "Spectacles"}</div>
                                  </>
                                ) : null}
                              </TD>
                              <TD className="font-medium">{eye}</TD>
                              <TD align="right">{fmtRx(eye === "OD" ? rx.odSphere : rx.osSphere)}</TD>
                              <TD align="right">{fmtRx(eye === "OD" ? rx.odCylinder : rx.osCylinder)}</TD>
                              <TD align="right">{(eye === "OD" ? rx.odAxis : rx.osAxis) ?? "—"}</TD>
                              <TD align="right">{fmtRx(eye === "OD" ? rx.odAdd : rx.osAdd)}</TD>
                              <TD align="right">{i === 0 ? rx.pdDistance ?? "—" : ""}</TD>
                              <TD className="text-text-2">{i === 0 ? practitionerName ?? "—" : ""}</TD>
                            </TR>
                          )),
                        )}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </Card>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Date of birth", value: c.birthDate ? f.date(c.birthDate) : "—" },
                    { label: "Address", value: [c.addressLine1, c.city].filter(Boolean).join(", ") || "—" },
                    { label: "Source", value: c.source?.replace("_", " ") ?? "—" },
                    { label: "From lead", value: data.leadCode && c.convertedFromLeadId ? <Link href={`/app/leads/${c.convertedFromLeadId}`} className="underline">{data.leadCode}</Link> : "—" },
                    { label: "SMS updates", value: c.smsConsent ? "Yes" : "No" },
                    { label: "Marketing", value: c.marketingConsent ? "Yes" : "No" },
                    { label: "Customer since", value: f.date(c.createdAt) },
                  ]}
                />
                {c.notes ? <p className="mt-3 rounded-[10px] bg-surface-2 p-3 text-[13px] whitespace-pre-line text-text-2">{c.notes}</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Appointments" />
              {data.appointments.length === 0 ? (
                <EmptyState title="No appointments" />
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {data.appointments.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{a.typeName}</p>
                        <p className="text-[12px] text-text-3">
                          {f.dateTime(a.startsAt)} · {a.branchName}
                        </p>
                      </div>
                      <AppointmentPill status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {can(ctx, "sales.view") ? (
              <Card>
                <CardHeader title="Payments" />
                {data.payments.length === 0 ? (
                  <EmptyState title="No payments yet" />
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {data.payments.slice(0, 8).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                        <div>
                          <p className={p.status === "voided" ? "font-medium text-text-3 line-through" : "font-medium"}>{f.money(p.amountCents)}</p>
                          <p className="text-[12px] text-text-3">
                            {PAYMENT_METHOD_LABELS[p.method]} · {p.saleNumber}
                          </p>
                        </div>
                        <span className="text-[12px] text-text-3">{f.date(p.receivedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Activity" />
              <ul className="divide-y divide-line border-t border-line">
                {data.history.slice(0, 12).map((h) => (
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

export default function CustomerPage(props: PageProps<"/app/customers/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
