import { Truck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listSuppliers } from "@/server/services/purchasing";
import { SupplierFormDialog } from "./supplier-form";

const PATH = "/app/suppliers";

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "suppliers.view")) return <Forbidden what="suppliers" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const data = await listSuppliers(ctx, { q: typeof sp.q === "string" ? sp.q : undefined, includeArchived: sp.archived === "1", page: Number(sp.page ?? 1) });
  return (
    <PageBody>
      <Toolbar actions={can(ctx, "suppliers.manage") ? <SupplierFormDialog /> : null}>
        <SearchInput placeholder="Search supplier, code or contact" />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Truck />} title="No suppliers yet">Add the frame distributors, contact lens suppliers and labs you buy from.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <TH>Supplier</TH>
                  <TH>Contact</TH>
                  <TH>Terms</TH>
                  <TH align="right">Lead time</TH>
                  <TH align="right">Products</TH>
                  <TH align="right">Open POs</TH>
                  <TH align="right">Received value</TH>
                </THead>
                <tbody>
                  {data.rows.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/app/suppliers/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-[11.5px] text-text-3">{s.code}</div>
                      </TD>
                      <TD className="text-text-2">
                        <div>{s.contactName ?? "—"}</div>
                        <div className="text-[11.5px] text-text-3">{s.phone ?? s.email ?? ""}</div>
                      </TD>
                      <TD className="text-text-2">{s.paymentTerms ?? "—"}</TD>
                      <TD align="right">{s.leadTimeDays !== null ? `${s.leadTimeDays} d` : "—"}</TD>
                      <TD align="right">{s.productCount}</TD>
                      <TD align="right">{s.openPoCount}</TD>
                      <TD align="right" className="font-medium">
                        {f.money(s.spendCents)}
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

export default function SuppliersPage(props: PageProps<"/app/suppliers">) {
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Distributors and laboratories, with purchase history." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
