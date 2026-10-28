import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Pill, type Tone } from "@/components/ui/pill";
import type { GhlRecordStatus } from "@/server/integrations/ghl/record-status";

const SYNC: Record<string, { label: string; tone: Tone }> = {
  synced: { label: "Synced", tone: "positive" },
  pending: { label: "Queued", tone: "info" },
  processing: { label: "Syncing", tone: "info" },
  retry_scheduled: { label: "Retrying", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  needs_review: { label: "Needs attention", tone: "warning" },
  skipped: { label: "Skipped", tone: "neutral" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};
const OPP: Record<string, Tone> = { open: "info", won: "positive", lost: "neutral", abandoned: "neutral" };

/** Where this record stands in GoHighLevel: contact, opportunity and the latest sync attempt. */
export function GhlRecordCard({ status, money, dateTime, note }: { status: GhlRecordStatus; money: (c: number) => string; dateTime: (d: Date) => string; note: string }) {
  const sync = status.lastEvent ? (SYNC[status.lastEvent.status] ?? { label: status.lastEvent.status, tone: "neutral" as Tone }) : null;
  return (
    <Card>
      <CardHeader title="GoHighLevel" subtitle={note} />
      <CardBody>
        <DetailList
          items={[
            { label: "Contact", value: status.contactId ? <span className="font-mono text-[12px]">{status.contactId}</span> : "Not linked yet" },
            {
              label: "Opportunity",
              value: status.opportunity ? (
                <span className="flex flex-col items-end gap-1 text-right">
                  <span>
                    {status.opportunity.pipeline ?? "Pipeline"} · {status.opportunity.stage ?? "stage not mapped"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Pill tone={OPP[status.opportunity.status] ?? "neutral"}>{status.opportunity.deleted ? "Deleted in GHL" : status.opportunity.status}</Pill>
                    <span className="text-[12px] text-text-3 tabular">{money(status.opportunity.valueCents)}</span>
                  </span>
                </span>
              ) : (
                "None yet"
              ),
            },
            {
              label: "Last sync",
              value: sync ? (
                <span className="flex flex-col items-end gap-1 text-right">
                  <span className="flex items-center gap-1.5">
                    <Pill tone={sync.tone} dot>
                      {sync.label}
                    </Pill>
                    <span className="text-[12px] text-text-3">{dateTime(status.lastEvent!.at)}</span>
                  </span>
                  {status.lastEvent!.lastError && status.lastEvent!.status !== "synced" ? <span className="max-w-[260px] text-[12px] text-neg">{status.lastEvent!.lastError}</span> : null}
                </span>
              ) : (
                "Not queued"
              ),
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}
