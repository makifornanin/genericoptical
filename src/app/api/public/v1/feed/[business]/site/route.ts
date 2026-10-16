import { publicFeed, publicFeedPreflight } from "@/server/public-api-http";
import { publicSite } from "@/server/services/public-api";

/** Public catalogue feed: business, branches, services and categories (opt-in per business). */
export async function GET(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/site">) {
  const { business } = await ctx.params;
  return publicFeed(request, business, (id) => publicSite(id));
}

export async function OPTIONS(request: Request, ctx: RouteContext<"/api/public/v1/feed/[business]/site">) {
  const { business } = await ctx.params;
  return publicFeedPreflight(request, business);
}
