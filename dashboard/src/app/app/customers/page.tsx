import { Download, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listCustomers } from "@/server/services/customers";
import { CustomerFormDialog } from "./forms";

const PATH = "/app/customers";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  if (!can(session.ctx, "customers.view")) return <Forbidden what="customers" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const { branches } = await getBranchContext(session.business.id);
  const status = (str(sp.status) ?? "active") as "active" | "inactive" | "archived" | "all";
  const data = await listCustomers(session.ctx, {
    q: str(sp.q),
    status,
    branchId: str(sp.branch),
    withBalance: sp.balance === "1",
    page: Number(sp.page ?? 1),
    sort: str(sp.sort) ?? "name",
    dir: sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : undefined,
  });
  return (
    <PageBody>
      <Toolbar
        actions={
          <>
            <ButtonLink href="/api/export/customers" prefetch={false}>
              <Download /> Export CSV
            </ButtonLink>
            {can(session.ctx, "customers.manage") ? <CustomerFormDialog branches={branches} /> : null}
          </>
        }
      >
        <SearchInput placeholder="Search name, phone, email or code" />
        <ParamSelect
          param="status"
          label="Status"
          options={[
            { value: "", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "All (not archived)" },
          ]}
        />
        <ParamSelect param="branch" label="Home branch" options={[{ value: "", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        <ParamSelect param="balance" label="Balance" options={[{ value: "", label: "Any balance" }, { value: "1", label: "Owes money" }]} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Users />} title={sp.q ? "No customers match your search" : "No customers yet"}>
            {sp.q ? "Try a phone number or part of the name." : "Add customers here or at the point of sale; converted leads appear automatically."}
          </EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Customer" column="name" pathname={PATH} params={sp} />
                  <TH>Contact</TH>
                  <TH>Home branch</TH>
                  <TH align="right">Visits</TH>
                  <SortTH label="Lifetime value" column="lifetime" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <TH align="right">Balance</TH>
                  <SortTH label="Last purchase" column="last" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                </THead>
                <tbody>
                  {data.rows.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`/app/customers/${c.id}`} className="font-medium hover:underline">
                          {c.firstName} {c.lastName}
                        </Link>
                        <div className="text-[11.5px] text-text-3">
                          {c.code}
                          {c.status === "inactive" ? " · inactive" : ""}
                          {c.archivedAt ? " · archived" : ""}
                        </div>
                      </TD>
                      <TD className="text-text-2">
                        <div>{c.phone ?? "—"}</div>
                        <div className="max-w-[220px] truncate text-[11.5px] text-text-3">{c.email ?? ""}</div>
                      </TD>
                      <TD className="text-text-2">{c.homeBranchName ?? "—"}</TD>
                      <TD align="right">{c.stats.visits}</TD>
                      <TD align="right" className="font-medium">
                        {f.money(Number(c.stats.lifetimeCents))}
                      </TD>
                      <TD align="right">{Number(c.stats.balanceCents) > 0 ? <Pill tone="warning">{f.money(Number(c.stats.balanceCents))}</Pill> : <span className="text-text-3">—</span>}</TD>
                      <TD align="right" className="text-text-2">
                        {c.stats.lastPurchase ? f.date(c.stats.lastPurchase) : "—"}
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

export default function CustomersPage(props: PageProps<"/app/customers">) {
  return (
    <>
      <PageHeader title="Customers" subtitle="Profiles, purchase history, balances and prescriptions." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
