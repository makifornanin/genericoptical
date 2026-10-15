import type { Metadata } from "next";
import Link from "next/link";
import { emailDeliveryAvailable } from "@/server/mail";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold">Reset your password</h1>
      <p className="mt-1 mb-6 text-[14px] text-text-2">We&apos;ll email a link to choose a new password.</p>
      <ForgotForm />
      {emailDeliveryAvailable() ? null : (
        <p className="mt-5 rounded-[10px] bg-muted-soft px-3 py-2.5 text-[12.5px] text-text-2">
          Email delivery isn&apos;t configured in this installation. Reset links are written to the server log in development; otherwise ask an owner or manager to set a temporary password for you under Staff.
        </p>
      )}
      <Link href="/login" className="mt-5 block text-center text-[13px] text-text-2 hover:text-text">
        ← Back to sign in
      </Link>
    </div>
  );
}
