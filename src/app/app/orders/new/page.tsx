import { and, eq, isNull } from "drizzle-orm";
import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton } from "@/components/app/page";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { customers, suppliers } from "@/server/db/schema";
import { sellableVariants } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { locationForBranch } from "@/server/services/inventory";
import { OrderForm } from "../order-form";

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "orders.manage")) return <Forbidden what="order creation" />;
  const sp = await searchParams;
  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  const requested = typeof sp.branch === "string" ? sp.branch : null;
  const branchId = branches.find((b) => b.id === requested)?.id ?? selectedBranchId ?? session.membership.defaultBranchId ?? branches[0]?.id;
  if (!branchId) return <PageBody><p className="text-[13.5px] text-text-2">Add a branch first.</p></PageBody>;
  const location = await locationForBranch(getDb(), ctx, branchId);
  const [items, labs] = await Promise.all([
    sellableVariants(ctx, { locationId: location.id, limit: 600 }),
    getDb().select({ id: suppliers.id, name: suppliers.name, code: suppliers.code }).from(suppliers).where(and(eq(suppliers.businessId, session.business.id), isNull(suppliers.archivedAt))),
  ]);
  let initialCustomer = null;
  if (typeof sp.customer === "string") {
    const [c] = await getDb()
      .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, code: customers.code, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.businessId, session.business.id), eq(customers.id, sp.customer), isNull(customers.archivedAt)))
      .limit(1);
    if (c) initialCustomer = { id: c.id, name: `${c.firstName} ${c.lastName}`, code: c.code, phone: c.phone };
  }
  const defaultLab = labs.find((l) => /lab/i.test(l.name))?.id ?? "";
  return (
    <PageBody>
      <OrderForm
        key={branchId}
        items={items.map((i) => ({
          variantId: i.variantId,
          productName: i.productName,
          brand: i.brand,
          label: i.label,
          sku: i.sku,
          barcode: i.barcode,
          priceCents: i.priceCents,
          costCents: i.costCents,
          productType: i.productType,
          taxExempt: i.taxExempt,
          imageUrl: i.imageUrl,
          categoryId: i.categoryId,
          available: i.available,
        }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        branchId={branchId}
        suppliers={labs.map((l) => ({ id: l.id, name: l.name }))}
        tax={{ rateBps: session.business.taxRateBps, pricesIncludeTax: session.business.pricesIncludeTax, name: session.business.taxName }}
        money={{ currency: session.business.currency, locale: session.business.locale }}
        initialCustomer={initialCustomer}
        canCreateCustomer={can(ctx, "customers.manage")}
        canSeeCost={can(ctx, "products.costs")}
        defaultLabId={defaultLab}
      />
    </PageBody>
  );
}

export default function NewOrderPage(props: PageProps<"/app/orders/new">) {
  return (
    <>
      <PageHeader title="New customer order" subtitle="Prescription eyewear and special orders: reserved stock, lab tracking, deposits and pickup." />
      <Suspense fallback={<TableSkeleton toolbar={false} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
