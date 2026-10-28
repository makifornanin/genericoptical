import { getSession } from "@/server/auth/session";
import { AppError } from "@/server/services/core";
import { getExpenseAttachment } from "@/server/services/expenses";
import { contentDisposition } from "@/server/http";
import { readAttachment } from "@/server/storage";

export async function GET(_request: Request, ctx: RouteContext<"/api/expenses/[id]/attachment">) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  try {
    const meta = await getExpenseAttachment(session.ctx, id);
    const file = await readAttachment(meta.path!);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": contentDisposition(meta.name ?? "attachment"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 404 });
    return new Response("Attachment not available", { status: 404 });
  }
}
