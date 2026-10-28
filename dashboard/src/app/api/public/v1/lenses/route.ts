import { publicRead } from "@/server/public-api-http";
import { publicLenses } from "@/server/services/website-orders";

/** Published prescription lenses (made to order) with their type and price, for the website's lens picker. */
export async function GET(request: Request) {
  return publicRead(request, "catalog:read", (auth) => publicLenses(auth.businessId));
}
