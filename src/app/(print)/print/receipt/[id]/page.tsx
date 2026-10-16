import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { formatter } from "@/lib/format";
import { MANUAL_PAYMENT_NOTE, NON_CASH_METHODS, RECEIPT_DISCLAIMER } from "@/lib/receipt";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import { requireSession } from "@/server/auth/session";
import { AppError, can } from "@/server/services/core";
import { getSale } from "@/server/services/sales";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };

async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.ctx, "sales.view")) notFound();
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSale>>;
  try {
    data = await getSale(session.ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const b = session.business;
  const f = formatter(b);
  const s = data.sale;
  const isSlip = s.kind === "order" && s.status === "open";
  return (
    <div className="mx-auto my-8 w-full max-w-[380px] bg-white p-6 font-mono text-[12px] leading-relaxed text-black shadow-[var(--shadow-pop)] print:my-0 print:shadow-none">
      <div className="text-center">
        <p className="font-sans text-[16px] font-bold">{b.name}</p>
        {b.legalName ? <p>{b.legalName}</p> : null}
        <p>{data.branchName} branch</p>
        <p>{[data.branchAddress, data.branchCity].filter(Boolean).join(", ")}</p>
        {data.branchPhone ? <p>{data.branchPhone}</p> : null}
        {b.taxRegistration ? <p>TIN: {b.taxRegistration}</p> : null}
      </div>
      <p className="my-3 border-y border-dashed border-black py-1 text-center font-bold">{isSlip ? "ORDER SLIP — NOT A RECEIPT" : s.status === "cancelled" ? "CANCELLED" : s.kind === "order" ? "ORDER RECEIPT" : "SALES RECEIPT"}</p>
      <p>No.: {s.number}</p>
      <p>Date: {f.dateTime(s.completedAt ?? s.createdAt)}</p>
      {data.customer ? <p>Customer: {data.customer.firstName} {data.customer.lastName} ({data.customer.code})</p> : null}
      {data.soldByName ? <p>Served by: {data.soldByName}</p> : null}
      <div className="my-3 border-t border-dashed border-black" />
      {data.items.map((i) => (
        <div key={i.id} className="mb-1.5">
          <p>
            {i.productName}
            {i.variantLabel && i.variantLabel !== "Default" ? ` (${i.variantLabel})` : ""}
          </p>
          <div className="flex justify-between">
            <span>
              {i.quantity} × {f.money(i.unitPriceCents)}
              {i.discountCents ? ` −${f.money(i.discountCents)}` : ""}
            </span>
            <span>{f.money(i.lineTotalCents)}</span>
          </div>
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-black" />
      <Row label="Subtotal" value={f.money(s.subtotalCents)} />
      {s.discountCents ? <Row label="Discounts" value={`−${f.money(s.discountCents)}`} /> : null}
      <Row label={`${b.taxName} ${s.taxRateBps / 100}%${s.pricesIncludeTax ? " incl." : ""}`} value={f.money(s.taxCents)} />
      <Row label="TOTAL" value={f.money(s.totalCents)} bold />
      <div className="my-2" />
      {data.payments
        .filter((p) => p.payment.status === "completed")
        .map(({ payment: p }) => (
          <div key={p.id}>
            <Row label={`${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` ${p.reference}` : ""}${NON_CASH_METHODS.has(p.method) ? " *" : ""}`} value={f.money(p.amountCents)} />
            {p.tenderedCents && p.changeCents ? (
              <>
                <Row label="  Cash received" value={f.money(p.tenderedCents)} />
                <Row label="  Change" value={f.money(p.changeCents)} />
              </>
            ) : null}
          </div>
        ))}
      {data.refunds.map(({ refund: r }) => (
        <Row key={r.id} label={`Refund ${r.number}`} value={`−${f.money(r.amountCents)}`} />
      ))}
      <Row label="Balance due" value={f.money(s.balanceDueCents)} bold />
      {s.kind === "order" ? (
        <>
          <div className="my-3 border-t border-dashed border-black" />
          {s.dueOn ? <p>Ready by: {f.date(s.dueOn)}</p> : null}
          <p>Order status: {s.fulfillmentStatus.replace(/_/g, " ")}</p>
        </>
      ) : null}
      <div className="my-3 border-t border-dashed border-black" />
      <p className="text-center">{b.receiptFooter ?? "Thank you!"}</p>
      {data.payments.some((p) => p.payment.status === "completed" && NON_CASH_METHODS.has(p.payment.method)) ? <p className="mt-3 text-[10.5px]">* {MANUAL_PAYMENT_NOTE}</p> : null}
      <p className="mt-2 text-center text-[10.5px]">{RECEIPT_DISCLAIMER}</p>
      <div className="mt-6 flex justify-center gap-2 font-sans print:hidden">
        <PrintButton />
        <a href={`/api/sales/${s.id}/receipt`} download className={buttonClass("secondary")}>
          Download PDF
        </a>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold" : ""}`}>
      <span className="whitespace-pre">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ReceiptPage(props: PageProps<"/print/receipt/[id]">) {
  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <Suspense fallback={<p className="p-8 text-center text-[13px] text-text-3">Preparing receipt…</p>}>
        <Receipt params={props.params} />
      </Suspense>
    </div>
  );
}
