import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatter } from "@/lib/format";
import { MANUAL_PAYMENT_NOTE, NON_CASH_METHODS, RECEIPT_DISCLAIMER } from "@/lib/receipt";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import type { getSale } from "@/server/services/sales";

type SaleData = Awaited<ReturnType<typeof getSale>>;
type Biz = {
  name: string;
  legalName: string | null;
  taxRegistration: string | null;
  receiptFooter: string | null;
  taxName: string;
  currency: string;
  locale: string;
  timezone: string;
};

// The 14 standard PDF fonts only encode WinAnsi (Latin-1 plus a few symbols). Anything else is
// transliterated or replaced, so a customer name in another script can never break the download.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function pdfText(s: string) {
  return s
    .replace(/₱/g, "PHP ")
    .replace(/[−‒]/g, "-")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => (WIN_ANSI_EXTRA.has(ch) ? ch : "?"));
}

type Row = { text?: string; left?: string; right?: string; bold?: boolean; center?: boolean; rule?: boolean; gap?: boolean };

const WIDTH = 226; // 80 mm receipt paper
const MARGIN = 14;
const SIZE = 8.5;
const LINE = 11.5;

function wrap(text: string, font: PDFFont, max: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, SIZE) <= max) line = next;
    else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** An 80 mm receipt PDF with the same content as the printable receipt. */
export async function receiptPdf(data: SaleData, b: Biz): Promise<Uint8Array> {
  const f = formatter(b);
  const m = (c: number) => pdfText(f.money(c));
  const s = data.sale;
  const isSlip = s.kind === "order" && s.status === "open";
  const rows: Row[] = [
    { text: b.name, bold: true, center: true },
    ...(b.legalName ? [{ text: b.legalName, center: true }] : []),
    { text: `${data.branchName} branch`, center: true },
    ...([data.branchAddress, data.branchCity].filter(Boolean).length ? [{ text: [data.branchAddress, data.branchCity].filter(Boolean).join(", "), center: true }] : []),
    ...(data.branchPhone ? [{ text: data.branchPhone, center: true }] : []),
    ...(b.taxRegistration ? [{ text: `TIN: ${b.taxRegistration}`, center: true }] : []),
    { rule: true },
    { text: isSlip ? "ORDER SLIP - NOT A RECEIPT" : s.status === "cancelled" ? "CANCELLED" : s.kind === "order" ? "ORDER RECEIPT" : "SALES RECEIPT", bold: true, center: true },
    { rule: true },
    { text: `No.: ${s.number}` },
    { text: `Date: ${f.dateTime(s.completedAt ?? s.createdAt)}` },
    ...(data.customer ? [{ text: `Customer: ${data.customer.firstName} ${data.customer.lastName} (${data.customer.code})` }] : []),
    ...(data.soldByName ? [{ text: `Served by: ${data.soldByName}` }] : []),
    { rule: true },
  ];
  for (const i of data.items) {
    rows.push({ text: `${i.productName}${i.variantLabel && i.variantLabel !== "Default" ? ` (${i.variantLabel})` : ""}` });
    rows.push({ left: `  ${i.quantity} x ${m(i.unitPriceCents)}${i.discountCents ? ` -${m(i.discountCents)}` : ""}`, right: m(i.lineTotalCents) });
  }
  rows.push({ rule: true });
  rows.push({ left: "Subtotal", right: m(s.subtotalCents) });
  if (s.discountCents) rows.push({ left: "Discounts", right: `-${m(s.discountCents)}` });
  rows.push({ left: `${b.taxName} ${s.taxRateBps / 100}%${s.pricesIncludeTax ? " incl." : ""}`, right: m(s.taxCents) });
  rows.push({ left: "TOTAL", right: m(s.totalCents), bold: true });
  rows.push({ gap: true });
  const completed = data.payments.filter((p) => p.payment.status === "completed").map((p) => p.payment);
  for (const p of completed) {
    rows.push({ left: `${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` ${p.reference}` : ""}${NON_CASH_METHODS.has(p.method) ? " *" : ""}`, right: m(p.amountCents) });
    if (p.tenderedCents && p.changeCents) {
      rows.push({ left: "  Cash received", right: m(p.tenderedCents) });
      rows.push({ left: "  Change", right: m(p.changeCents) });
    }
  }
  for (const { refund: r } of data.refunds) rows.push({ left: `Refund ${r.number}`, right: `-${m(r.amountCents)}` });
  rows.push({ left: "Balance due", right: m(s.balanceDueCents), bold: true });
  if (s.kind === "order") {
    rows.push({ rule: true });
    if (s.dueOn) rows.push({ text: `Ready by: ${f.date(s.dueOn)}` });
    rows.push({ text: `Order status: ${s.fulfillmentStatus.replace(/_/g, " ")}` });
  }
  rows.push({ rule: true });
  rows.push({ text: b.receiptFooter ?? "Thank you!", center: true });
  rows.push({ gap: true });
  if (completed.some((p) => NON_CASH_METHODS.has(p.method))) rows.push({ text: `* ${MANUAL_PAYMENT_NOTE}` });
  rows.push({ text: RECEIPT_DISCLAIMER, center: true });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${s.number}`);
  pdf.setProducer("Optical management dashboard");
  const font = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  const inner = WIDTH - MARGIN * 2;

  // Lay out first (wrapping long lines), then size the page to fit.
  type Drawn = { kind: "text"; text: string; x: number; bold: boolean } | { kind: "row"; left: string; right: string; bold: boolean } | { kind: "rule" } | { kind: "gap" };
  const drawn: Drawn[] = [];
  for (const r of rows) {
    if (r.rule) drawn.push({ kind: "rule" });
    else if (r.gap) drawn.push({ kind: "gap" });
    else if (r.text !== undefined) {
      const fnt = r.bold ? bold : font;
      for (const line of wrap(pdfText(r.text), fnt, inner)) {
        const x = r.center ? MARGIN + (inner - fnt.widthOfTextAtSize(line, SIZE)) / 2 : MARGIN;
        drawn.push({ kind: "text", text: line, x, bold: !!r.bold });
      }
    } else {
      const fnt = r.bold ? bold : font;
      const right = pdfText(r.right ?? "");
      const room = inner - fnt.widthOfTextAtSize(right, SIZE) - 6;
      const left = wrap(pdfText(r.left ?? ""), fnt, room);
      left.slice(0, -1).forEach((l) => drawn.push({ kind: "text", text: l, x: MARGIN, bold: !!r.bold }));
      drawn.push({ kind: "row", left: left[left.length - 1], right, bold: !!r.bold });
    }
  }
  const height = MARGIN * 2 + drawn.reduce((h, d) => h + (d.kind === "gap" ? LINE / 2 : d.kind === "rule" ? LINE * 0.8 : LINE), 0);
  const page = pdf.addPage([WIDTH, Math.max(height, 200)]);
  let y = page.getHeight() - MARGIN - SIZE;
  const ink = rgb(0, 0, 0);
  for (const d of drawn) {
    if (d.kind === "gap") {
      y -= LINE / 2;
      continue;
    }
    if (d.kind === "rule") {
      page.drawLine({ start: { x: MARGIN, y: y + SIZE / 2 }, end: { x: WIDTH - MARGIN, y: y + SIZE / 2 }, thickness: 0.5, color: ink, dashArray: [2, 2] });
      y -= LINE * 0.8;
      continue;
    }
    const fnt = d.bold ? bold : font;
    if (d.kind === "text") page.drawText(d.text, { x: d.x, y, size: SIZE, font: fnt, color: ink });
    else {
      page.drawText(d.left, { x: MARGIN, y, size: SIZE, font: fnt, color: ink });
      page.drawText(d.right, { x: WIDTH - MARGIN - fnt.widthOfTextAtSize(d.right, SIZE), y, size: SIZE, font: fnt, color: ink });
    }
    y -= LINE;
  }
  return pdf.save();
}
