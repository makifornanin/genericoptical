import { publicFeed, publicFeedPreflight } from "@/server/public-api-http";
import { publicProduct } from "@/server/services/public-api";

/** Public catalogue feed: one published product with variants, per-branch availability and related items. */
export async function GET(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/products/[slug]">) {
  const { business, slug } = await ctx.params;
  return publicFeed(request, business, (id) => publicProduct(id, slug.slice(0, 200)));
}

export async function OPTIONS(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/products/[slug]">) {
  const { business } = await ctx.params;
  return publicFeedPreflight(request, business);
}
