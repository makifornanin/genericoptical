import { SquareKanban, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { LeadStagePill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { LEAD_INTEREST_LABELS, LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listLeads, staffForAssignment } from "@/server/services/leads";
import { LeadFormDialog } from "./forms";

const PATH = "/app/leads";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "leads.view")) return <Forbidden what="leads" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const view = str(sp.view) ?? "open";
  const [data, staff, { branches }] = await Promise.all([
    listLeads(ctx, {
      q: str(sp.q),
      stage: str(sp.stage),
      source: str(sp.source),
      assigned: str(sp.assigned),
      followUp: sp.followUp === "due" ? "due" : null,
      open: view === "open" && !sp.stage,
      page: Number(sp.page ?? 1),
      sort: str(sp.sort) ?? "created",
      dir: sp.dir === "asc" ? "asc" : "desc",
    }),
    staffForAssignment(ctx),
    getBranchContext(session.business.id),
  ]);
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  return (
    <PageBody>
      <Toolbar
        actions={
          <>
            <ButtonLink href="/app/pipeline">
              <SquareKanban /> Pipeline view
            </ButtonLink>
            {can(ctx, "leads.manage") ? <LeadFormDialog staff={staff} branches={branches} canAssign={can(ctx, "leads.assign")} /> : null}
          </>
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="view"
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All" },
          ]}
        />
        <SearchInput placeholder="Search name, phone, email or code" />
        <ParamSelect param="stage" label="Stage" options={[{ value: "", label: "Any stage" }, ...LEAD_STAGES.map((s) => ({ value: s, label: LEAD_STAGE_LABELS[s] }))]} />
        <ParamSelect param="source" label="Source" options={[{ value: "", label: "Any source" }, ...LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))]} />
        {can(ctx, "leads.view_all") ? (
          <ParamSelect param="assigned" label="Assigned to" options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
        ) : null}
        <ParamSelect param="followUp" label="Follow-up" options={[{ value: "", label: "Any follow-up" }, { value: "due", label: "Due or overdue" }]} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<UserPlus />} title="No leads found">
            {can(ctx, "leads.view_all") ? "Website inquiries and leads you add appear here." : "Leads assigned to you appear here."}
          </EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Lead" column="name" pathname={PATH} params={sp} />
                  <TH>Interest</TH>
                  <TH>Source</TH>
                  <TH>Stage</TH>
                  <TH>Assigned</TH>
                  <SortTH label="Follow-up" column="follow_up" pathname={PATH} params={sp} />
                  <SortTH label="Value" column="value" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <SortTH label="Created" column="created" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                </THead>
                <tbody>
                  {data.rows.map((l) => {
                    const overdue = l.followUpAt && new Date(l.followUpAt).getTime() < now && l.stage !== "converted" && l.stage !== "lost";
                    return (
                      <TR key={l.id}>
                        <TD>
                          <Link href={`/app/leads/${l.id}`} className="font-medium hover:underline">
                            {l.firstName} {l.lastName}
                          </Link>
                          <div className="text-[11.5px] text-text-3">
                            {l.code}
                            {l.phone ? ` · ${l.phone}` : ""}
                          </div>
                        </TD>
                        <TD className="text-text-2">{l.interest ? LEAD_INTEREST_LABELS[l.interest] ?? l.interest : "—"}</TD>
                        <TD className="text-text-2">{LEAD_SOURCE_LABELS[l.source] ?? l.source}</TD>
                        <TD>
                          <LeadStagePill stage={l.stage} />
                        </TD>
                        <TD className="text-text-2">{l.assignedName ?? <span className="text-text-3">Unassigned</span>}</TD>
                        <TD className={overdue ? "font-medium text-neg" : "text-text-2"}>{l.followUpAt ? f.dateTime(l.followUpAt) : "—"}</TD>
                        <TD align="right">{l.estimatedValueCents ? f.money(l.estimatedValueCents) : "—"}</TD>
                        <TD align="right" className="text-text-2">
                          {f.date(l.createdAt)}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
          </>
        )}
      </Card>
    </PageBody>
  );
}

export default function LeadsPage(props: PageProps<"/app/leads">) {
  return (
    <>
      <PageHeader title="Leads" subtitle="Inquiries from the website, social channels, walk-ins and referrals." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
