import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/lib/permissions";
import { getDb } from "@/server/db";
import { branches } from "@/server/db/schema";
import { resolveSession, type SessionInfo } from "@/server/services/auth";

export const SESSION_COOKIE = "specta_session";
export const BRANCH_COOKIE = "specta_branch";

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

/** The signed-in session for this request (memoised per request), or null. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token, await requestMeta());
});

/** For pages: redirects to the sign-in page when there's no valid session. */
export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function hasPermission(session: SessionInfo, permission: Permission) {
  return session.ctx.permissions.has(permission);
}

/** Active branches plus the branch chosen in the global switcher ("all" = null). */
export const getBranchContext = cache(async (businessId: string) => {
  const list = await getDb()
    .select({ id: branches.id, name: branches.name, code: branches.code })
    .from(branches)
    .where(and(eq(branches.businessId, businessId), eq(branches.isActive, true)))
    .orderBy(asc(branches.sortOrder), asc(branches.name));
  const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
  const selected = list.find((b) => b.id === chosen) ?? null;
  return { branches: list, selectedBranchId: selected?.id ?? null, selectedBranch: selected };
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
