import { publicRead } from "@/server/public-api-http";
import { publicProduct } from "@/server/services/public-api";

/** One published product with variants, per-branch availability and related items. */
export async function GET(request: Request, ctx: RouteContext<"/api/public/v1/products/[slug]">) {
  const { slug } = await ctx.params;
  return publicRead(request, "catalog:read", (auth) => publicProduct(auth.businessId, slug.slice(0, 200)));
}
