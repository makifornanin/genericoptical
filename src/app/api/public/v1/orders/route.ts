import { publicWrite } from "@/server/public-api-http";
import { placeWebsiteOrder } from "@/server/services/website-orders";

/**
 * Places a website order (pickup at a branch). Idempotent on `idempotencyKey`: a retried checkout
 * returns the same order and status link. Demo store: online card payments are simulated.
 */
export async function POST(request: Request) {
  return publicWrite(
    request,
    "orders:write",
    { maxBytes: 32 * 1024, perKey: [300, 3600], perIp: [10, 600], bucket: "order", status: 201 },
    (auth, body, ip) => placeWebsiteOrder(auth.businessId, body, { ip }),
  );
}
