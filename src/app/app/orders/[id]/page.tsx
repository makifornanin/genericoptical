import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden } from "@/components/app/page";
import { requireSession } from "@/server/auth/session";
import { AppError, can } from "@/server/services/core";
import { getSale } from "@/server/services/sales";
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
  return <SaleDocument data={data} session={session} />;
}

export default function OrderPage(props: PageProps<"/app/orders/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
