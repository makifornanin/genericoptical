import { publicRead } from "@/server/public-api-http";
import { publicSite } from "@/server/services/public-api";

/** Business profile, website copy, branches, services and booking calendars (docs/PUBLIC_API.md). */
export async function GET(request: Request) {
  return publicRead(request, "site:read", (auth) => publicSite(auth.businessId));
}
