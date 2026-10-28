import { publicWrite } from "@/server/public-api-http";
import { lookupWebsiteOrder } from "@/server/services/website-orders";

/** "Find my order": order number + checkout email → the status link token. Rate-limited per visitor IP. */
export async function POST(request: Request) {
  return publicWrite(request, "orders:read", { maxBytes: 2048, perKey: [600, 3600], perIp: [12, 600], bucket: "order-lookup" }, (auth, body) => lookupWebsiteOrder(auth.businessId, body));
}
