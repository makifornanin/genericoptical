import { publicRead } from "@/server/public-api-http";
import { publicProducts } from "@/server/services/public-api";

/** Published catalogue with coarse availability. `?category=<slug>&q=<text>` (docs/PUBLIC_API.md). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return publicRead(request, "catalog:read", (auth) => publicProducts(auth.businessId, { category: params.get("category"), q: params.get("q") }));
}
