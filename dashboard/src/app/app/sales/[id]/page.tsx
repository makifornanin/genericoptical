import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardsSkeleton, Forbidden } from "@/components/app/page";
import { requireSession } from "@/server/auth/session";
import { AppError, can } from "@/server/services/core";
import { ghlRecordStatus } from "@/server/integrations/ghl/record-status";
import { getSale } from "@/server/services/sales";
import { SaleDocument } from "../sale-document";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!can(session.ctx, "sales.view")) return <Forbidden what="transactions" />;
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getSale>>;
  try {
    data = await getSale(session.ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  if (data.sale.kind === "order") redirect(`/app/orders/${id}`);
  const ghl = await ghlRecordStatus(session.ctx, "sale", id);
  return <SaleDocument data={data} session={session} ghl={ghl} />;
}

export default function SalePage(props: PageProps<"/app/sales/[id]">) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
