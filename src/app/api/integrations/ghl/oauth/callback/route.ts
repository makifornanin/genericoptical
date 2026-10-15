import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { completeOAuth } from "@/server/integrations/ghl";
import { log } from "@/server/log";
import { AppError } from "@/server/services/core";

/**
 * OAuth redirect target (register this exact URL in the HighLevel app). The staff member who started
 * the connection must still be signed in; the state issued to them is validated server-side.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (params: Record<string, string>) => NextResponse.redirect(new URL(`/app/settings?tab=integrations&${new URLSearchParams(params)}`, url.origin));
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/app/settings?tab=integrations")}`, url.origin));
  if (url.searchParams.get("error")) return back({ ghl: "error", message: "Authorisation was cancelled in GoHighLevel." });
  try {
    const r = await completeOAuth(session.ctx, { code: url.searchParams.get("code"), state: url.searchParams.get("state") });
    return back({ ghl: "connected", account: r.accountName ?? r.locationId });
  } catch (error) {
    const message = error instanceof AppError || (error instanceof Error && error.name.startsWith("Ghl")) ? error.message : "Connecting GoHighLevel failed. Try again.";
    log.warn("ghl.oauth_failed", { businessId: session.business.id, error: error instanceof Error ? error.message : String(error) });
    return back({ ghl: "error", message: message.slice(0, 240) });
  }
}
