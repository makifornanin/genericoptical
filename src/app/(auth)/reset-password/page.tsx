import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

async function ResetContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await searchParams).token;
  if (typeof token !== "string" || !token) {
    return (
      <p className="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] text-text-2">
        This link is incomplete. <Link href="/forgot-password" className="underline">Request a new reset link</Link>.
      </p>
    );
  }
  return <ResetForm token={token} />;
}

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold">Choose a new password</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-2">You&apos;ll be signed out on other devices.</p>
      <Suspense fallback={<div className="h-48" />}>
        <ResetContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
