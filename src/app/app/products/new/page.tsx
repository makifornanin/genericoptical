import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton } from "@/components/app/page";
import { requireSession } from "@/server/auth/session";
import { listCategories } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { listLocations } from "@/server/services/inventory";
import { listSuppliers } from "@/server/services/purchasing";
import { ProductForm } from "../product-form";

async function Content() {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "products.manage")) return <Forbidden what="product editing" />;
  const [categories, suppliers, locations] = await Promise.all([
    listCategories(ctx),
    can(ctx, "suppliers.view") ? listSuppliers(ctx, { pageSize: 100 }) : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
    listLocations(ctx),
  ]);
  return (
    <PageBody>
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
        locations={locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }))}
        canSeeCost={can(ctx, "products.costs")}
        initial={{
          name: "",
          brand: "",
          description: "",
          imageUrl: "",
          categoryId: "",
          supplierId: "",
          productType: "stock",
          taxExempt: false,
          showOnWebsite: false,
          isActive: true,
          shape: "",
          material: "",
          variants: [{ sku: "", barcode: "", label: "", size: "", color: "", priceCents: null, costCents: null, reorderPoint: 2, reorderQty: 5, isActive: true }],
        }}
      />
    </PageBody>
  );
}

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" subtitle="Add the product and its variants. Stock is added as opening stock or received through a purchase order." />
      <Suspense fallback={<TableSkeleton toolbar={false} />}>
        <Content />
      </Suspense>
    </>
  );
}
