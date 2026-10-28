"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BRANCH_COOKIE, clearSessionCookie, getSession, getBranchContext } from "@/server/auth/session";
import { destroySession } from "@/server/services/auth";

export async function signOutAction() {
  const token = (await cookies()).get("specta_session")?.value;
  await destroySession(token);
  await clearSessionCookie();
  redirect("/login?signedOut=1");
}

export async function setBranchAction(branchId: string | null) {
  const session = await getSession();
  if (!session) return;
  const jar = await cookies();
  if (!branchId) {
    jar.delete(BRANCH_COOKIE);
    return;
  }
  const { branches } = await getBranchContext(session.business.id);
  if (!branches.some((b) => b.id === branchId)) return; // ignore branches from other businesses
  jar.set(BRANCH_COOKIE, branchId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
}
