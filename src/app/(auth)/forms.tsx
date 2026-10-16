"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/ui/form";
import { requestResetAction, resetPasswordAction, signInAction, type AuthFormState } from "./actions";

export function SignInForm({ next, demoAccounts, demoPassword }: { next?: string; demoAccounts?: { email: string; role: string; name: string }[]; demoPassword?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, undefined);
  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <TextField label="Email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={state?.error} />
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full justify-center">
          Sign in
        </Button>
        <Link href="/forgot-password" className="text-center text-[13px] text-text-2 underline-offset-4 hover:text-text hover:underline">
          Forgot your password?
        </Link>
      </form>
      {demoAccounts?.length ? (
        <div className="rounded-[14px] border border-line bg-surface p-4">
          <p className="text-[12.5px] font-semibold">Demo accounts</p>
          <p className="mt-0.5 text-[12px] text-text-3">
            Password for all: <code className="rounded bg-muted-soft px-1 py-0.5 font-mono text-[11.5px] text-text">{demoPassword}</code>
          </p>
          <ul className="mt-3 divide-y divide-line">
            {demoAccounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(demoPassword ?? "");
                  }}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left text-[12.5px] hover:text-text"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{a.role}</span>
                    <span className="block truncate text-text-3">{a.email}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-text-2">Use</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestResetAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} />
      <FormError message={state?.error} />
      {state?.message ? <p className="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] text-text-2">{state.message}</p> : null}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full justify-center">
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters, including a letter and a number." />
      <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <FormError message={state?.error} />
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full justify-center">
        Set new password
      </Button>
    </form>
  );
}
