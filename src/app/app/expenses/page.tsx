import { Download, Paperclip, ReceiptText } from "lucide-react";
import { Suspense } from "react";
import { BarList } from "@/components/app/charts";
import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";
import { Kpi } from "@/components/app/kpi";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listExpenseCategories, listExpenses } from "@/server/services/expenses";
import { EditExpenseButton, ExpenseFormDialog, VoidExpenseButton } from "./expense-form";

const PATH = "/app/expenses";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "expenses.view")) return <Forbidden what="expenses" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const range = resolveRange(str(sp.range) ?? "this_month", session.business.timezone, { from: str(sp.from), to: str(sp.to) });
  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  const [data, categories] = await Promise.all([
    listExpenses(ctx, { q: str(sp.q), categoryId: str(sp.category), branchId: str(sp.branch) ?? selectedBranchId, fromDay: range.fromDay, toDay: range.toDay, status: str(sp.status) ?? null, page: Number(sp.page ?? 1), pageSize: 30 }),
    listExpenseCategories(ctx),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.business.timezone }).format(new Date());
  const manage = can(ctx, "expenses.manage");
  const blank = { categoryId: "", branchId: selectedBranchId ?? "", amountCents: null, expenseDate: today, paymentMethod: "bank_transfer", payee: "", description: "", reference: "" };
  const catOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000));
  return (
    <PageBody>
      <Toolbar
        actions={
          <>
            <ButtonLink href={`/api/export/expenses?range=${range.preset}${range.preset === "custom" ? `&from=${range.fromDay}&to=${range.toDay}` : ""}`} prefetch={false}>
              <Download /> Export CSV
            </ButtonLink>
            {manage ? <ExpenseFormDialog initial={blank} categories={catOptions} branches={branchOptions} /> : null}
          </>
        }
      >
        <DateRangeFilter label={range.label} />
        <SearchInput placeholder="Description, payee or reference" />
        <ParamSelect param="category" label="Category" options={[{ value: "", label: "All categories" }, ...catOptions.map((c) => ({ value: c.id, label: c.name }))]} />
        <ParamSelect param="branch" label="Branch" options={[{ value: "", label: selectedBranchId ? "Selected branch" : "All branches" }, ...branchOptions.map((b) => ({ value: b.id, label: b.name }))]} />
        <ParamSelect param="status" label="Status" options={[{ value: "", label: "Recorded" }, { value: "voided", label: "Voided" }]} />
      </Toolbar>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <Kpi inverted label="Total expenses" value={f.money(data.sumCents)} caption={`${data.total} entries · ${range.label.toLowerCase()}`} />
            <Kpi label="Average per day" value={f.money(Math.round(data.sumCents / days))} caption={`over ${days} day(s)`} />
          </div>
          <Card>
            {data.total === 0 ? (
              <EmptyState icon={<ReceiptText />} title="No expenses in this period">Rent, payroll, utilities, lab fees and supplies recorded here feed the financial reports.</EmptyState>
            ) : (
              <>
                <TableWrap>
                  <Table>
                    <THead>
                      <TH>Date</TH>
                      <TH>Description</TH>
                      <TH>Category</TH>
                      <TH>Branch</TH>
                      <TH align="right">Amount</TH>
                      {manage ? <TH align="right">{""}</TH> : null}
                    </THead>
                    <tbody>
                      {data.rows.map(({ expense: e, categoryName, branchName, createdByName }) => (
                        <TR key={e.id} className={e.status === "voided" ? "opacity-60" : undefined}>
                          <TD className="whitespace-nowrap text-text-2">{f.date(e.expenseDate)}</TD>
                          <TD>
                            <span className="font-medium">{e.description}</span>
                            {e.status === "voided" ? <Pill className="ml-2">Voided</Pill> : null}
                            <div className="text-[11.5px] text-text-3">
                              {[e.payee, e.reference, createdByName ? `by ${createdByName}` : null].filter(Boolean).join(" · ")}
                              {e.attachmentPath ? (
                                <a href={`/api/expenses/${e.id}/attachment`} className="ml-2 inline-flex items-center gap-0.5 underline" target="_blank" rel="noreferrer">
                                  <Paperclip className="size-3" /> {e.attachmentName ?? "attachment"}
                                </a>
                              ) : null}
                            </div>
                          </TD>
                          <TD className="text-text-2">{categoryName}</TD>
                          <TD className="text-text-2">{branchName ?? "Business-wide"}</TD>
                          <TD align="right" className="font-medium">
                            {f.money(e.amountCents)}
                          </TD>
                          {manage ? (
                            <TD align="right">
                              {e.status === "recorded" ? (
                                <div className="flex justify-end">
                                  <EditExpenseButton
                                    id={e.id}
                                    categories={catOptions}
                                    branches={branchOptions}
                                    hasAttachment={Boolean(e.attachmentPath)}
                                    initial={{ categoryId: e.categoryId, branchId: e.branchId ?? "", amountCents: e.amountCents, expenseDate: e.expenseDate, paymentMethod: e.paymentMethod ?? "bank_transfer", payee: e.payee ?? "", description: e.description, reference: e.reference ?? "" }}
                                  />
                                  <VoidExpenseButton id={e.id} />
                                </div>
                              ) : null}
                            </TD>
                          ) : null}
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
              </>
            )}
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="By category" subtitle={range.label} />
          <CardBody>
            <BarList items={data.byCategory.map((c) => ({ label: c.name, value: c.sumCents, sub: data.sumCents ? `${Math.round((c.sumCents / data.sumCents) * 100)}%` : undefined }))} valueFormat="money" money={f.moneyMeta} />
          </CardBody>
        </Card>
      </div>
    </PageBody>
  );
}

export default function ExpensesPage(props: PageProps<"/app/expenses">) {
  return (
    <>
      <PageHeader title="Expenses" subtitle="Operating costs by category and branch. Voided entries are kept for the record." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
