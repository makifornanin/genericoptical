import { List } from "lucide-react";
import { Suspense } from "react";
import { ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { ButtonLink } from "@/components/ui/button";
import type { SearchParams } from "@/components/ui/table";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { pipelineBoard, staffForAssignment } from "@/server/services/leads";
import { LeadFormDialog } from "../leads/forms";
import { PipelineBoard } from "./board";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "leads.view")) return <Forbidden what="the pipeline" />;
  const sp = await searchParams;
  const [columns, staff, { branches }] = await Promise.all([
    pipelineBoard(ctx, { q: str(sp.q), assigned: str(sp.assigned), source: str(sp.source) }),
    staffForAssignment(ctx),
    getBranchContext(session.business.id),
  ]);
  const leads = columns.flatMap((c) =>
    c.leads.map((l) => ({
      id: l.id,
      code: l.code,
      firstName: l.firstName,
      lastName: l.lastName,
      interest: l.interest,
      stage: l.stage,
      estimatedValueCents: l.estimatedValueCents,
      assignedName: l.assignedName,
      followUpAt: l.followUpAt ? l.followUpAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    })),
  );
  return (
    <PageBody>
      <Toolbar
        actions={
          <>
            <ButtonLink href="/app/leads">
              <List /> List view
            </ButtonLink>
            {can(ctx, "leads.manage") ? <LeadFormDialog staff={staff} branches={branches} canAssign={can(ctx, "leads.assign")} /> : null}
          </>
        }
      >
        <SearchInput placeholder="Filter by name, phone or code" />
        <ParamSelect param="source" label="Source" options={[{ value: "", label: "Any source" }, ...LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))]} />
        {can(ctx, "leads.view_all") ? (
          <ParamSelect param="assigned" label="Assigned to" options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
        ) : null}
      </Toolbar>
      <p className="-mt-1 text-[12.5px] text-text-3">Drag a card to another column, or use its ⋯ menu. Converted and lost columns show the last 45 days.</p>
      <PipelineBoard leads={leads} currency={session.business.currency} locale={session.business.locale} canManage={can(ctx, "leads.manage")} />
    </PageBody>
  );
}

export default function PipelinePage(props: PageProps<"/app/pipeline">) {
  return (
    <>
      <PageHeader title="CRM pipeline" subtitle="Every open lead by stage, from first inquiry to conversion." />
      <Suspense fallback={<TableSkeleton toolbar rows={6} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
