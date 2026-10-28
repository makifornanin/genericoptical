import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden } from "@/components/app/page";
import { requireSession } from "@/server/auth/session";
import { ghlRecordStatus } from "@/server/integrations/ghl/record-status";
import { AppError, can } from "@/server/services/core";
import { getSale } from "@/server/services/sales";
import { websiteOrderDetails } from "@/server/services/website-orders";
import { SaleDocument } from "../../sales/sale-document";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.ctx, "orders.view")) return <Forbidden what="orders" />;
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSale>>;
  try {
    data = await getSale(session.ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  if (data.sale.kind !== "order") redirect(`/app/sales/${id}`);
  const [ghl, website] = await Promise.all([ghlRecordStatus(session.ctx, "sale", id), data.sale.channel === "website" ? websiteOrderDetails(session.ctx, id) : null]);
  return <SaleDocument data={data} session={session} ghl={ghl} website={website} />;
}

export default function OrderPage(props: PageProps<"/app/orders/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
