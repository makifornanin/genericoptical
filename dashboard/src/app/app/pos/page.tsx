import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/page";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { listCategories, sellableVariants } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { locationForBranch } from "@/server/services/inventory";
import { popularVariantIds } from "@/server/services/pos";
import { toPosItem } from "./items";
import { PosTerminal } from "./terminal";

export const metadata: Metadata = { title: "Point of sale" };

async function Register({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "pos.use")) return <Forbidden what="the point of sale" />;
  const sp = await searchParams;
  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  if (!branches.length) return <p className="p-6 text-[13.5px] text-text-2">Add a branch in Settings before selling.</p>;
  const requested = typeof sp.branch === "string" ? sp.branch : null;
  const branchId = branches.find((b) => b.id === requested)?.id ?? selectedBranchId ?? branches.find((b) => b.id === session.membership.defaultBranchId)?.id ?? branches[0].id;
  const location = await locationForBranch(getDb(), ctx, branchId);
  const [items, categories, popular] = await Promise.all([sellableVariants(ctx, { locationId: location.id, limit: 600 }), listCategories(ctx), popularVariantIds(ctx, branchId)]);
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
    <PosTerminal
      key={branchId}
      items={items.map(toPosItem)}
      popularIds={popular}
      categories={categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name }))}
      branchId={branchId}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      business={{ name: session.business.name, demo: process.env.DEMO_MODE === "true" && session.business.isDemo }}
      cashier={{ name: session.user.name, role: ROLE_LABELS[session.membership.role as Role] }}
      tax={{ rateBps: session.business.taxRateBps, pricesIncludeTax: session.business.pricesIncludeTax, name: session.business.taxName }}
      money={{ currency: session.business.currency, locale: session.business.locale }}
      maxDiscountBps={session.business.settings.maxStaffDiscountBps ?? 2000}
      canDiscountUnlimited={can(ctx, "sales.discount.unlimited")}
      canCreateCustomer={can(ctx, "customers.manage")}
      initialCustomer={initialCustomer}
    />
  );
}

function RegisterSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="h-14 border-b border-line bg-surface" />
      <div className="grid flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="animate-pulse rounded-[16px] bg-surface-2" />
        <div className="hidden animate-pulse rounded-[16px] bg-surface-2 md:block" />
      </div>
    </div>
  );
}

export default function PosPage(props: PageProps<"/app/pos">) {
  return (
    <Suspense fallback={<RegisterSkeleton />}>
      <Register searchParams={props.searchParams} />
    </Suspense>
  );
}
