import type { Metadata } from "next";
import { Suspense } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/demo/constants";
import { ROLE_LABELS } from "@/lib/permissions";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

async function LoginContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // Demo sign-ins are listed only when explicitly allowed (local demos), never on a hosted deployment
  // by default: DEMO_MODE alone must not publish credentials.
  const demo = process.env.DEMO_MODE === "true" && process.env.SHOW_DEMO_LOGINS === "true";
  const notice = sp.reset
    ? "Password updated. Sign in with your new password."
    : sp.demoReset
      ? "Demo data was rebuilt. Everyone was signed out — sign in again with a demo account."
      : sp.signedOut
        ? "You've been signed out."
        : null;
  return (
    <>
      {notice ? <p className="mb-4 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] text-text-2">{notice}</p> : null}
      <SignInForm
        next={typeof sp.next === "string" ? sp.next : undefined}
        demoAccounts={demo ? DEMO_ACCOUNTS.map((a) => ({ email: a.email, name: a.name, role: ROLE_LABELS[a.role] })) : undefined}
        demoPassword={demo ? DEMO_PASSWORD : undefined}
      />
    </>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold">Sign in</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-2">Staff access to the operations dashboard.</p>
      <Suspense fallback={<div className="h-64" />}>
        <LoginContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
