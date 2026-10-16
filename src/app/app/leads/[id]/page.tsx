import { ArrowLeft, CalendarPlus, Mail, MessageSquare, Phone, PhoneCall, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden, PageBody } from "@/components/app/page";
import { AppointmentPill, LeadStagePill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { GhlRecordCard } from "@/components/app/ghl-record";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { ghlRecordStatus } from "@/server/integrations/ghl/record-status";
import { Pill } from "@/components/ui/pill";
import { formatter } from "@/lib/format";
import { LEAD_INTEREST_LABELS, LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, type LeadStage } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { AppError, can } from "@/server/services/core";
import { getLead, staffForAssignment } from "@/server/services/leads";
import { AssignMenu, ConvertButton, EditLeadButton, FollowUpControl, NoteComposer, StageMenu } from "../forms";

const ICON: Record<string, typeof StickyNote> = { call: PhoneCall, sms: MessageSquare, email: Mail };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "leads.view")) return <Forbidden what="leads" />;
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getLead>>;
  try {
    data = await getLead(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const f = formatter(session.business);
  const l = data.lead;
  const [staff, { branches }, ghl] = await Promise.all([staffForAssignment(ctx), getBranchContext(session.business.id), ghlRecordStatus(ctx, "lead", id)]);
  const manage = can(ctx, "leads.manage");
  const closed = l.stage === "converted" || l.stage === "lost";

  return (
    <>
      <header className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pt-7">
        <div>
          <Link href="/app/leads" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-text-2 hover:text-text">
            <ArrowLeft className="size-3.5" /> Leads
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold">
              {l.firstName} {l.lastName}
            </h1>
            <Pill>{l.code}</Pill>
            <LeadStagePill stage={l.stage} />
          </div>
          <p className="mt-1 text-[13px] text-text-2">
            {LEAD_SOURCE_LABELS[l.source] ?? l.source} · {l.interest ? LEAD_INTEREST_LABELS[l.interest] : "General inquiry"} · added {f.dateTime(l.createdAt)}
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            {can(ctx, "leads.assign") ? <AssignMenu id={l.id} staff={staff} current={l.assignedMembershipId} /> : null}
            <StageMenu id={l.id} stage={l.stage as LeadStage} />
            {!closed && can(ctx, "appointments.manage") ? (
              <ButtonLink href={`/app/appointments?new=1&lead=${l.id}`}>
                <CalendarPlus /> Book appointment
              </ButtonLink>
            ) : null}
            <EditLeadButton
              id={l.id}
              staff={staff}
              branches={branches}
              canAssign={can(ctx, "leads.assign")}
              initial={{
                firstName: l.firstName,
                lastName: l.lastName,
                email: l.email ?? "",
                phone: l.phone ?? "",
                source: l.source,
                interest: l.interest ?? "eye_exam",
                message: l.message ?? "",
                assignedMembershipId: l.assignedMembershipId ?? "",
                preferredBranchId: l.preferredBranchId ?? "",
                followUpAt: l.followUpAt ? l.followUpAt.toISOString() : "",
                estimatedValueCents: l.estimatedValueCents,
                smsConsent: l.smsConsent,
                marketingConsent: l.marketingConsent,
              }}
            />
            {l.stage !== "converted" && can(ctx, "customers.manage") ? <ConvertButton id={l.id} /> : null}
          </div>
        ) : null}
      </header>
      <PageBody>
        {l.stage === "converted" && l.convertedCustomerId ? (
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-pos/20 bg-pos-soft px-4 py-3 text-[13.5px] text-pos">
            <span>
              Converted to customer <span className="font-semibold">{data.customerCode}</span> on {f.date(l.convertedAt)}. This lead&apos;s history is preserved.
            </span>
            <ButtonLink href={`/app/customers/${l.convertedCustomerId}`} size="sm">
              Open customer
            </ButtonLink>
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            {manage ? (
              <Card>
                <CardHeader title="Log activity" subtitle="Notes, calls and messages are added to the timeline" />
                <CardBody>
                  <NoteComposer id={l.id} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Timeline" subtitle={`${data.timeline.length} entries`} />
              <ol className="relative border-t border-line px-5 py-4">
                {data.timeline.map(({ activity: a, actorName }) => {
                  const Icon = ICON[a.type] ?? StickyNote;
                  return (
                    <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                      <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-text-3">
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[13px]">
                          <span className="font-medium">{actorName ?? (a.type === "created" ? "Website" : "System")}</span>{" "}
                          <span className="text-text-2">
                            {a.type === "stage_change" || (a.toStage && a.type !== "created")
                              ? `moved ${a.fromStage ? LEAD_STAGE_LABELS[a.fromStage as LeadStage] : ""} → ${a.toStage ? LEAD_STAGE_LABELS[a.toStage as LeadStage] : ""}`
                              : { created: "created the lead", note: "added a note", call: "logged a call", sms: "logged an SMS", email: "logged an email", assignment: "changed assignment", follow_up: "scheduled a follow-up", inquiry: "received another inquiry", appointment: "booked an appointment", conversion: "converted the lead" }[a.type] ?? a.type}
                          </span>
                          <span className="text-text-3"> · {f.dateTime(a.createdAt)}</span>
                        </p>
                        {a.body ? <p className="mt-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] whitespace-pre-line text-text-2">{a.body}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Contact" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Phone", value: l.phone ? <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="size-3.5" />{l.phone}</a> : "—" },
                    { label: "Email", value: l.email ? <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a> : "—" },
                    { label: "Preferred branch", value: data.branchName ?? "—" },
                    { label: "Assigned to", value: data.assignedName ?? "Unassigned" },
                    { label: "Estimated value", value: l.estimatedValueCents ? f.money(l.estimatedValueCents) : "—" },
                    { label: "Last contacted", value: l.lastContactedAt ? f.dateTime(l.lastContactedAt) : "—" },
                    { label: "SMS / marketing", value: `${l.smsConsent ? "Yes" : "No"} / ${l.marketingConsent ? "Yes" : "No"}` },
                    ...(l.lostReason ? [{ label: "Lost reason", value: l.lostReason }] : []),
                    ...(l.externalGhlContactId ? [{ label: "GoHighLevel contact", value: l.externalGhlContactId }] : []),
                  ]}
                />
                {l.message ? <p className="mt-3 rounded-[10px] bg-surface-2 p-3 text-[13px] whitespace-pre-line text-text-2">{l.message}</p> : null}
              </CardBody>
            </Card>
            {ghl ? <GhlRecordCard status={ghl} money={f.money} dateTime={f.dateTime} note="Contact and the lead's opportunity in the lead pipeline. Stage changes sync both ways." /> : null}
            {manage && !closed ? (
              <Card>
                <CardHeader title="Follow-up" subtitle={l.followUpAt ? `Currently ${f.dateTime(l.followUpAt)}` : "No follow-up scheduled"} />
                <CardBody>
                  <FollowUpControl id={l.id} current={l.followUpAt ? l.followUpAt.toISOString() : null} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Appointments" />
              {data.appointments.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {data.appointments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                      {f.dateTime(a.startsAt)}
                      <AppointmentPill status={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-5 text-[13px] text-text-3">None booked yet.</p>
              )}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default function LeadPage(props: PageProps<"/app/leads/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
