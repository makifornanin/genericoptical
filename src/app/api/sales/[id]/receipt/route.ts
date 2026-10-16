import { getSession } from "@/server/auth/session";
import { contentDisposition } from "@/server/http";
import { receiptPdf } from "@/server/receipt-pdf";
import { AppError, can } from "@/server/services/core";
import { getSale } from "@/server/services/sales";

/** Downloadable PDF of a sale's receipt (same content as /print/receipt/<id>). */
export async function GET(_request: Request, ctx: RouteContext<"/api/sales/[id]/receipt">) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });
  if (!can(session.ctx, "sales.view")) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  try {
    const data = await getSale(session.ctx, id);
    const bytes = await receiptPdf(data, session.business);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(`receipt-${data.sale.number}.pdf`, "attachment"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
