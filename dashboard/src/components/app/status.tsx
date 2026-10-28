import { Pill, type Tone } from "@/components/ui/pill";
import { APPOINTMENT_STATUS_LABELS, FULFILLMENT_LABELS, LEAD_STAGE_LABELS, type FulfillmentStage, type LeadStage } from "@/lib/schemas";

export function PaymentPill({ status, refunded, total }: { status: string; refunded?: number; total?: number }) {
  if (refunded && total && refunded >= total) return <Pill tone="neutral" dot>Refunded</Pill>;
  const map: Record<string, [Tone, string]> = { paid: ["positive", "Paid"], partially_paid: ["warning", "Partially paid"], unpaid: ["negative", "Unpaid"] };
  const [tone, label] = map[status] ?? ["neutral", status];
  return (
    <Pill tone={tone} dot>
      {label}
      {refunded ? " · part refund" : ""}
    </Pill>
  );
}

export function SaleStatusPill({ status }: { status: string }) {
  if (status === "cancelled") return <Pill tone="neutral">Cancelled</Pill>;
  if (status === "open") return <Pill tone="info">Open</Pill>;
  return <Pill tone="positive">Completed</Pill>;
}

const FULFILLMENT_TONE: Record<FulfillmentStage, Tone> = {
  new: "neutral",
  confirmed: "info",
  processing: "info",
  awaiting_lab: "warning",
  ready_for_pickup: "accent",
  completed: "positive",
  cancelled: "neutral",
};

export function FulfillmentPill({ stage }: { stage: string }) {
  const s = stage as FulfillmentStage;
  return (
    <Pill tone={FULFILLMENT_TONE[s] ?? "neutral"} dot>
      {FULFILLMENT_LABELS[s] ?? stage}
    </Pill>
  );
}

const LEAD_TONE: Record<LeadStage, Tone> = {
  new: "info",
  contacted: "neutral",
  qualified: "accent",
  appointment_scheduled: "warning",
  follow_up: "warning",
  converted: "positive",
  lost: "negative",
};

export function LeadStagePill({ stage }: { stage: string }) {
  const s = stage as LeadStage;
  return <Pill tone={LEAD_TONE[s] ?? "neutral"}>{LEAD_STAGE_LABELS[s] ?? stage}</Pill>;
}

const APPT_TONE: Record<string, Tone> = { scheduled: "neutral", confirmed: "info", completed: "positive", cancelled: "neutral", no_show: "negative" };

export function AppointmentPill({ status }: { status: string }) {
  return (
    <Pill tone={APPT_TONE[status] ?? "neutral"} dot>
      {APPOINTMENT_STATUS_LABELS[status] ?? status}
    </Pill>
  );
}

export function StockPill({ available, reorderPoint }: { available: number; reorderPoint: number }) {
  if (available <= 0) return <Pill tone="negative" dot>Out of stock</Pill>;
  if (available <= reorderPoint) return <Pill tone="warning" dot>Low</Pill>;
  return <Pill tone="positive" dot>In stock</Pill>;
}

const PO_TONE: Record<string, [Tone, string]> = {
  draft: ["neutral", "Draft"],
  ordered: ["info", "Ordered"],
  partially_received: ["warning", "Partially received"],
  received: ["positive", "Received"],
  cancelled: ["neutral", "Cancelled"],
};

export function PoStatusPill({ status }: { status: string }) {
  const [tone, label] = PO_TONE[status] ?? ["neutral", status];
  return (
    <Pill tone={tone} dot>
      {label}
    </Pill>
  );
}
