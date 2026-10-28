import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: bounces requests without a session cookie away from the dashboard.
 * Every page, Server Action and Route Handler still verifies the session and permissions on
 * the server — this is not the security boundary.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("specta_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
