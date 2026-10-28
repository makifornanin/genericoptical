"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/server/env";
import { requestMeta, setSessionCookie } from "@/server/auth/session";
import { emailDeliveryAvailable, sendMail } from "@/server/mail";
import { AppError } from "@/server/services/core";
import { authenticate, createPasswordReset, resetPassword } from "@/server/services/auth";

export type AuthFormState = { error?: string; message?: string; email?: string } | undefined;

const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/app") && !next.startsWith("//") ? next : "/app");

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", email: String(form.get("email") ?? "") };
  try {
    const session = await authenticate(parsed.data.email, parsed.data.password, await requestMeta());
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message, email: parsed.data.email };
    console.error("[auth] sign-in failed", error);
    return { error: "Sign-in is unavailable right now. Please try again.", email: parsed.data.email };
  }
  redirect(safeNext(form.get("next")));
}

export async function requestResetAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address.", email };
  const reset = await createPasswordReset(email);
  if (reset) {
    const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(reset.token)}`;
    await sendMail({
      to: reset.user.email,
      subject: "Reset your password",
      text: `Hi ${reset.user.name},\n\nUse this link within 60 minutes to choose a new password:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
  }
  // Same response whether or not the account exists; wording depends only on whether email can be sent.
  return {
    message: emailDeliveryAvailable()
      ? "If that email belongs to an account, a reset link is on its way. The link expires in 60 minutes."
      : "Email delivery isn't set up on this installation yet, so no reset email can be sent. Ask the business owner to set a temporary password for you from Staff.",
    email,
  };
}

export async function resetPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) return { error: "The two passwords don't match." };
  try {
    await resetPassword(token, password);
  } catch (error) {
    return { error: error instanceof AppError ? error.message : "Couldn't reset the password. Request a new link." };
  }
  redirect("/login?reset=1");
}
