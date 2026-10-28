import { publicWrite } from "@/server/public-api-http";
import { quoteWebsiteCart } from "@/server/services/website-orders";

/** Prices a website bag from the catalogue and says which branches can fulfil it (never exact stock). */
export async function POST(request: Request) {
  return publicWrite(request, "catalog:read", { maxBytes: 16 * 1024, perKey: [600, 60], bucket: "quote" }, (auth, body) => quoteWebsiteCart(auth.businessId, body));
}
