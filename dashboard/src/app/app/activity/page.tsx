import { History } from "lucide-react";
import { Suspense } from "react";
import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listActivity, listStaff } from "@/server/services/staff";

const PATH = "/app/activity";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const ENTITY_LABELS: Record<string, string> = {
  sale: "Sales & orders",
  customer: "Customers",
  lead: "Leads",
  appointment: "Appointments",
  product: "Products",
  product_variant: "Stock",
  purchase_order: "Purchasing",
  supplier: "Suppliers",
  expense: "Expenses",
  membership: "Staff",
  business: "Settings",
  branch: "Branches",
};

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "audit.view")) return <Forbidden what="the activity log" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const range = sp.range ? resolveRange(str(sp.range), session.business.timezone, { from: str(sp.from), to: str(sp.to) }) : null;
  const [data, staff] = await Promise.all([
    listActivity(ctx, { q: str(sp.q), entityType: str(sp.entity) ?? null, actor: str(sp.actor) ?? null, from: range?.from, to: range?.to, page: Number(sp.page ?? 1) }),
    can(ctx, "staff.view") ? listStaff(ctx) : Promise.resolve([]),
  ]);
  return (
    <PageBody>
      <Toolbar>
        <SearchInput placeholder="Search activity" />
        <ParamSelect param="entity" label="Area" options={[{ value: "", label: "All areas" }, ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))]} />
        {staff.length ? <ParamSelect param="actor" label="Person" options={[{ value: "", label: "Everyone" }, ...staff.map((s) => ({ value: s.membership.id, label: s.name }))]} /> : null}
        <DateRangeFilter label={range?.label ?? "Any date"} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<History />} title="No activity matches" />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>Area</TH>
                  <TH>What happened</TH>
                </THead>
                <tbody>
                  {data.rows.map((a) => (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap text-text-2">{f.dateTime(a.createdAt)}</TD>
                      <TD className="whitespace-nowrap font-medium">{a.actorLabel}</TD>
                      <TD>
                        <Pill>{ENTITY_LABELS[a.entityType] ?? a.entityType}</Pill>
                      </TD>
                      <TD className="max-w-[640px]">
                        {a.summary}
                        <div className="font-mono text-[11px] text-text-3">{a.action}</div>
                      </TD>
                    </TR>
                  ))}
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

export default function ActivityPage(props: PageProps<"/app/activity">) {
  return (
    <>
      <PageHeader title="Activity log" subtitle="An audit trail of every change: who did what, and when." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
