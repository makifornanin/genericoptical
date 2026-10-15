"use client";

import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/ui/form";
import { changePasswordAction } from "./actions";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function ChangePasswordForm() {
  const [v, setV] = useState(EMPTY);
  const act = useAction(changePasswordAction, { onSuccess: () => setV(EMPTY) });
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(v);
      }}
    >
      <TextField label="Current password" type="password" autoComplete="current-password" required value={v.currentPassword} onChange={set("currentPassword")} error={act.fe("currentPassword")} />
      <TextField label="New password" type="password" autoComplete="new-password" required value={v.newPassword} onChange={set("newPassword")} error={act.fe("newPassword")} hint="At least 10 characters, including a letter and a number." />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" required value={v.confirmPassword} onChange={set("confirmPassword")} error={act.fe("confirmPassword")} />
      <FormError message={act.error} />
      <div>
        <Button type="submit" variant="primary" loading={act.pending} disabled={!v.currentPassword || !v.newPassword || !v.confirmPassword}>
          Change password
        </Button>
      </div>
    </form>
  );
}
