import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton } from "@/components/app/page";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { listCategories, sellableVariants } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { locationForBranch } from "@/server/services/inventory";
import { PosTerminal } from "./terminal";

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "pos.use")) return <Forbidden what="the point of sale" />;
  const sp = await searchParams;
  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  if (!branches.length) return <PageBody><p className="text-[13.5px] text-text-2">Add a branch in Settings before selling.</p></PageBody>;
  const requested = typeof sp.branch === "string" ? sp.branch : null;
  const branchId = branches.find((b) => b.id === requested)?.id ?? selectedBranchId ?? branches.find((b) => b.id === session.membership.defaultBranchId)?.id ?? branches[0].id;
  const location = await locationForBranch(getDb(), ctx, branchId);
  const [items, categories] = await Promise.all([sellableVariants(ctx, { locationId: location.id, limit: 600 }), listCategories(ctx)]);
  let initialCustomer = null;
  if (typeof sp.customer === "string") {
    const [c] = await getDb()
      .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, code: customers.code, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.businessId, session.business.id), eq(customers.id, sp.customer), isNull(customers.archivedAt)))
      .limit(1);
    if (c) initialCustomer = { id: c.id, name: `${c.firstName} ${c.lastName}`, code: c.code, phone: c.phone };
  }
  const used = new Set(items.map((i) => i.categoryId));
  return (
    <PageBody className="pb-6">
      <PosTerminal
        key={branchId}
        items={items.map((i) => ({
          variantId: i.variantId,
          productName: i.productName,
          brand: i.brand,
          label: i.label,
          sku: i.sku,
          barcode: i.barcode,
          priceCents: i.priceCents,
          productType: i.productType,
          taxExempt: i.taxExempt,
          imageUrl: i.imageUrl,
          categoryId: i.categoryId,
          available: i.available,
        }))}
        categories={categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        branchId={branchId}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        tax={{ rateBps: session.business.taxRateBps, pricesIncludeTax: session.business.pricesIncludeTax, name: session.business.taxName }}
        money={{ currency: session.business.currency, locale: session.business.locale }}
        maxDiscountBps={session.business.settings.maxStaffDiscountBps ?? 2000}
        canDiscountUnlimited={can(ctx, "sales.discount.unlimited")}
        canCreateCustomer={can(ctx, "customers.manage")}
        initialCustomer={initialCustomer}
      />
    </PageBody>
  );
}

export default function PosPage(props: PageProps<"/app/pos">) {
  return (
    <>
      <PageHeader title="Point of sale" subtitle="Counter sales: frames, sunglasses, contact lenses, care products and services." />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
