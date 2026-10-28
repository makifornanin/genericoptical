import { publicFeed, publicFeedPreflight } from "@/server/public-api-http";
import { publicProducts } from "@/server/services/public-api";

/** Public catalogue feed: published products with coarse availability. `?category=&q=` */
export async function GET(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/products">) {
  const { business } = await ctx.params;
  const params = new URL(request.url).searchParams;
  return publicFeed(request, business, (id) => publicProducts(id, { category: params.get("category"), q: params.get("q") }));
}

export async function OPTIONS(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/products">) {
  const { business } = await ctx.params;
  return publicFeedPreflight(request, business);
}
