import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { FulfillmentPill, PaymentPill, SaleStatusPill } from "@/components/app/status";
import { PageBody } from "@/components/app/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatter } from "@/lib/format";
import { FULFILLMENT_LABELS, FULFILLMENT_STAGES, PAYMENT_METHOD_LABELS, type FulfillmentStage } from "@/lib/schemas";
import type { SessionInfo } from "@/server/services/auth";
import { can } from "@/server/services/core";
import type { getSale } from "@/server/services/sales";
import { CancelSaleButton, OrderStageControl, RecordPaymentDialog, RefundDialog, VoidPaymentButton } from "./money-dialogs";
import { OrderDetailsForm } from "./order-details-form";

type Sale = Awaited<ReturnType<typeof getSale>>;

const FLOW: FulfillmentStage[] = FULFILLMENT_STAGES.filter((s) => s !== "cancelled");

export function SaleDocument({ data, session }: { data: Sale; session: SessionInfo }) {
  const ctx = session.ctx;
  const f = formatter(session.business);
  const s = data.sale;
  const isOrder = s.kind === "order";
  const money = f.moneyMeta;
  const netCollected = s.paidCents - s.refundedCashCents;
  const back = isOrder ? { href: "/app/orders", label: "Orders" } : { href: "/app/sales", label: "Transactions" };
  const stageIndex = FLOW.indexOf(s.fulfillmentStatus as FulfillmentStage);

  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div>
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> {back.label}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold">{s.number}</h1>
            {isOrder && s.status === "open" ? <FulfillmentPill stage={s.fulfillmentStatus} /> : <SaleStatusPill status={s.status} />}
            {s.status !== "cancelled" ? <PaymentPill status={s.paymentStatus} refunded={s.refundedCents} total={s.totalCents} /> : null}
          </div>
          <p className="mt-1 text-[13px] text-text-2">
            {isOrder ? "Customer order" : "Point-of-sale transaction"} · {data.branchName} · {f.dateTime(s.createdAt)}
            {data.soldByName ? ` · by ${data.soldByName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/print/receipt/${s.id}`} target="_blank">
            <Printer /> {isOrder && s.status === "open" ? "Order slip" : "Receipt"}
          </ButtonLink>
          {s.status !== "cancelled" && s.balanceDueCents > 0 && can(ctx, "payments.record") ? <RecordPaymentDialog saleId={s.id} balanceCents={s.balanceDueCents} money={money} /> : null}
          {can(ctx, "sales.refund") && s.status === "completed" && s.refundedCents < s.totalCents ? (
            <RefundDialog
              saleId={s.id}
              money={money}
              netCollectedCents={netCollected}
              balanceDueCents={s.balanceDueCents}
              lines={data.items.map((i) => ({ id: i.id, name: `${i.productName}${i.variantLabel && i.variantLabel !== "Default" ? ` · ${i.variantLabel}` : ""}`, quantity: i.quantity, refunded: i.refundedQuantity, lineTotalCents: i.lineTotalCents, stocked: i.productType === "stock" }))}
            />
          ) : null}
          {can(ctx, "sales.refund") && isOrder && s.status === "open" && netCollected > 0 ? <RefundDialog saleId={s.id} money={money} netCollectedCents={netCollected} balanceDueCents={s.balanceDueCents} lines={[]} depositOnly /> : null}
          {can(ctx, "sales.cancel") && ((s.kind === "pos" && s.status === "completed" && s.paidCents === 0 && s.refundedCents === 0) || (isOrder && s.status === "open" && netCollected === 0)) ? (
            <CancelSaleButton saleId={s.id} label={isOrder ? "Cancel order" : "Cancel sale"} />
          ) : null}
        </div>
      </header>
      <PageBody>
        {isOrder ? (
          <Card>
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <ol className="scroll-thin flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Fulfilment progress">
                {FLOW.map((stage, i) => {
                  const done = s.status !== "cancelled" && stageIndex >= i;
                  const current = s.fulfillmentStatus === stage;
                  return (
                    <li key={stage} className="flex shrink-0 items-center gap-1">
                      <span className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", current ? "bg-ink text-white" : done ? "bg-accent-soft text-ink" : "bg-muted-soft text-text-3")} aria-current={current ? "step" : undefined}>
                        <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px] font-semibold", current ? "bg-accent text-accent-ink" : done ? "bg-ink text-white" : "bg-surface text-text-3")}>{i + 1}</span>
                        {FULFILLMENT_LABELS[stage]}
                      </span>
                      {i < FLOW.length - 1 ? <span className={cn("h-px w-4", done && stageIndex > i ? "bg-ink" : "bg-line-strong")} /> : null}
                    </li>
                  );
                })}
                {s.status === "cancelled" ? <Pill tone="negative">Cancelled{s.cancelReason ? `: ${s.cancelReason}` : ""}</Pill> : null}
              </ol>
              {can(ctx, "orders.manage") && s.status === "open" ? <OrderStageControl saleId={s.id} allowed={data.allowedTransitions.filter((t) => t !== "cancelled")} balanceCents={s.balanceDueCents} money={money} /> : null}
            </div>
            {s.status === "open" ? (
              <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-text-3">
                {data.reservations.some((r) => r.status === "active")
                  ? `${data.reservations.filter((r) => r.status === "active").reduce((a, r) => a + r.quantity, 0)} stocked unit(s) reserved — they leave inventory when the order is handed over.`
                  : s.fulfillmentStatus === "new"
                    ? "Stock is reserved when the order is confirmed."
                    : "No stocked items on this order."}{" "}
                Payment and fulfilment are tracked separately: a paid order may still be in progress, and a handed-over order may still owe money.
              </p>
            ) : null}
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader title="Items" />
              <TableWrap>
                <Table>
                  <THead>
                    <TH>Item</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Unit price</TH>
                    <TH align="right">Discount</TH>
                    <TH align="right">Total</TH>
                  </THead>
                  <tbody>
                    {data.items.map((i) => (
                      <TR key={i.id}>
                        <TD>
                          <span className="font-medium">{i.productName}</span>
                          {i.variantLabel && i.variantLabel !== "Default" ? <span className="text-text-3"> · {i.variantLabel}</span> : null}
                          <div className="font-mono text-[11px] text-text-3">
                            {i.sku}
                            {i.productType === "made_to_order" ? " · made to order" : i.productType === "service" ? " · service" : ""}
                            {i.prescriptionId ? " · Rx attached" : ""}
                          </div>
                          {i.refundedQuantity ? <Pill tone="neutral" className="mt-1">{i.refundedQuantity} returned</Pill> : null}
                        </TD>
                        <TD align="right">{i.quantity}</TD>
                        <TD align="right">{f.money(i.unitPriceCents)}</TD>
                        <TD align="right" className="text-text-2">{i.discountCents ? `−${f.money(i.discountCents)}` : "—"}</TD>
                        <TD align="right" className="font-medium">{f.money(i.lineTotalCents)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <div className="flex justify-end border-t border-line px-5 py-4">
                <dl className="w-full max-w-[320px] text-[13px]">
                  {[
                    ["Subtotal", f.money(s.subtotalCents)],
                    ...(s.discountCents ? [["Discounts", `−${f.money(s.discountCents)}`]] : []),
                    [`${session.business.taxName} ${s.taxRateBps / 100}%${s.pricesIncludeTax ? " (included)" : ""}`, f.money(s.taxCents)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 text-text-2">
                      <dt>{k}</dt>
                      <dd className="tabular">{v}</dd>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular">{f.money(s.totalCents)}</dd>
                  </div>
                  <div className="flex justify-between py-0.5 text-text-2">
                    <dt>Paid</dt>
                    <dd className="tabular">{f.money(s.paidCents)}</dd>
                  </div>
                  {s.refundedCents || s.refundedCashCents ? (
                    <div className="flex justify-between py-0.5 text-text-2">
                      <dt>Refunded</dt>
                      <dd className="tabular">−{f.money(Math.max(s.refundedCents, s.refundedCashCents))}</dd>
                    </div>
                  ) : null}
                  <div className={cn("mt-1 flex justify-between rounded-[8px] px-2 py-1.5 font-semibold", s.balanceDueCents > 0 ? "bg-warn-soft text-warn" : "bg-pos-soft text-pos")}>
                    <dt>Balance due</dt>
                    <dd className="tabular">{f.money(s.balanceDueCents)}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <CardHeader title="Payments" subtitle={`${data.payments.filter((p) => p.payment.status === "completed").length} recorded`} />
              {data.payments.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-3">No payments yet.</p>
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <TH>Received</TH>
                      <TH>Method</TH>
                      <TH>Reference</TH>
                      <TH>By</TH>
                      <TH align="right">Amount</TH>
                      <TH align="right" className="w-20">
                        {""}
                      </TH>
                    </THead>
                    <tbody>
                      {data.payments.map(({ payment: p, receivedByName }) => (
                        <TR key={p.id} className={p.status === "voided" ? "opacity-60" : undefined}>
                          <TD className="text-text-2">{f.dateTime(p.receivedAt)}</TD>
                          <TD>
                            {PAYMENT_METHOD_LABELS[p.method]}
                            {p.notes ? <div className="text-[11.5px] text-text-3">{p.notes}</div> : null}
                          </TD>
                          <TD className="font-mono text-[12px] text-text-2">{p.reference ?? (p.tenderedCents ? `tendered ${f.money(p.tenderedCents)}` : "—")}</TD>
                          <TD className="text-text-2">{receivedByName ?? "—"}</TD>
                          <TD align="right" className={p.status === "voided" ? "line-through" : "font-medium"}>
                            {f.money(p.amountCents)}
                          </TD>
                          <TD align="right">{p.status === "voided" ? <Pill>Voided</Pill> : can(ctx, "payments.void") ? <VoidPaymentButton paymentId={p.id} /> : null}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            {data.refunds.length ? (
              <Card>
                <CardHeader title="Refunds" />
                <ul className="divide-y divide-line border-t border-line">
                  {data.refunds.map(({ refund: r, processedByName, items }) => (
                    <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3 text-[13px]">
                      <div>
                        <p className="font-medium">
                          {r.number} · {r.affectsRevenue ? "Return / credit" : "Deposit refund"} · {PAYMENT_METHOD_LABELS[r.method]}
                        </p>
                        <p className="text-[12px] text-text-3">
                          {f.dateTime(r.createdAt)} · {processedByName ?? "—"} · {r.reason}
                        </p>
                        {items.length ? (
                          <p className="mt-0.5 text-[12px] text-text-2">
                            {items.map((it) => {
                              const line = data.items.find((x) => x.id === it.saleItemId);
                              return `${it.quantity} × ${line?.productName ?? "item"} (${it.restock ? "restocked" : "damaged"})`;
                            }).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <span className="font-semibold tabular">−{f.money(r.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Customer" />
              <CardBody>
                {data.customer ? (
                  <DetailList
                    items={[
                      { label: "Name", value: <Link href={`/app/customers/${data.customer.id}`} className="underline">{data.customer.firstName} {data.customer.lastName}</Link> },
                      { label: "Code", value: data.customer.code },
                      { label: "Phone", value: data.customer.phone ?? "—" },
                    ]}
                  />
                ) : (
                  <p className="text-[13px] text-text-3">Walk-in sale (no customer linked).</p>
                )}
              </CardBody>
            </Card>
            {isOrder ? (
              <Card>
                <CardHeader title="Order details" />
                <CardBody>
                  {can(ctx, "orders.manage") && s.status === "open" ? (
                    <OrderDetailsForm saleId={s.id} initial={{ dueOn: s.dueOn ?? "", labReference: s.labReference ?? "", notes: s.notes ?? "" }} />
                  ) : (
                    <DetailList
                      items={[
                        { label: "Due", value: s.dueOn ? f.date(s.dueOn) : "—" },
                        { label: "Lab / supplier", value: data.labSupplierName ?? "—" },
                        { label: "Lab reference", value: s.labReference ?? "—" },
                        { label: "Handed over", value: s.completedAt ? f.dateTime(s.completedAt) : "—" },
                      ]}
                    />
                  )}
                  {can(ctx, "orders.manage") && s.status === "open" && data.labSupplierName ? <p className="mt-2 text-[12px] text-text-3">Lab: {data.labSupplierName}</p> : null}
                </CardBody>
              </Card>
            ) : s.notes ? (
              <Card>
                <CardHeader title="Notes" />
                <CardBody>
                  <p className="text-[13px] text-text-2">{s.notes}</p>
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="History" />
              <ol className="divide-y divide-line border-t border-line">
                {data.history.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <p className="text-[12.5px]">{h.summary}</p>
                    <p className="text-[11.5px] text-text-3">
                      {h.actorLabel} · {f.dateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
