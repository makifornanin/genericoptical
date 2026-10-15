import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton } from "@/components/app/page";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { purchasableVariants } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { listLocations } from "@/server/services/inventory";
import { listSuppliers } from "@/server/services/purchasing";
import { PoForm } from "../po-form";

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "purchasing.manage")) return <Forbidden what="purchase order creation" />;
  const sp = await searchParams;
  const [suppliers, locations, variants, { selectedBranchId }] = await Promise.all([listSuppliers(ctx, { pageSize: 100 }), listLocations(ctx), purchasableVariants(ctx), getBranchContext(session.business.id)]);
  const active = locations.filter((l) => l.isActive);
  const defaultLocation = active.find((l) => l.branchId === selectedBranchId)?.id ?? active[0]?.id ?? "";
  return (
    <PageBody>
      <PoForm
        suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
        locations={active.map((l) => ({ id: l.id, name: l.name }))}
        variants={variants}
        currency={session.business.currency}
        locale={session.business.locale}
        initial={{ supplierId: typeof sp.supplier === "string" ? sp.supplier : "", locationId: defaultLocation, expectedOn: "", notes: "", items: [] }}
      />
    </PageBody>
  );
}

export default function NewPurchaseOrderPage(props: PageProps<"/app/purchase-orders/new">) {
  return (
    <>
      <PageHeader title="New purchase order" subtitle="Saved as a draft. A manager confirms it with the supplier before stock can be received." />
      <Suspense fallback={<TableSkeleton toolbar={false} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
