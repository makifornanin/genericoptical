"use client";

import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormError, SelectField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, type Permission, type Role } from "@/lib/permissions";
import { saveStaffAction, setTemporaryPasswordAction } from "./actions";

export type StaffValues = {
  name: string;
  email: string;
  role: Role;
  title: string;
  phone: string;
  defaultBranchId: string;
  takesAppointments: boolean;
  calendarColor: string;
  grant: string[];
  revoke: string[];
  isActive: boolean;
};

const ROLE_SUMMARY: Record<Role, string> = {
  owner: "Everything, including settings, staff and integrations.",
  manager: "Runs operations: sales, refunds, stock, purchasing, CRM, reports.",
  sales: "Point of sale, orders, customers, assigned leads, appointments.",
  inventory: "Products, stock, suppliers and purchase orders.",
  practitioner: "Own appointments and authorised clinical records.",
};

export function StaffFormDialog({ id, initial, branches, canMakeOwner, trigger }: { id?: string; initial: StaffValues; branches: { id: string; name: string }[]; canMakeOwner: boolean; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<StaffValues>(initial);
  const [password, setPassword] = useState("");
  const save = useAction(saveStaffAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof StaffValues>(k: K, val: StaffValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const base = new Set<Permission>(ROLE_PERMISSIONS[v.role]);
  const effective = (p: Permission) => (v.role === "owner" ? true : v.revoke.includes(p) ? false : base.has(p) || v.grant.includes(p));
  const toggle = (p: Permission, on: boolean) => {
    const inBase = base.has(p);
    setV((x) => ({
      ...x,
      grant: on && !inBase ? [...new Set([...x.grant, p])] : x.grant.filter((g) => g !== p),
      revoke: !on && inBase ? [...new Set([...x.revoke, p])] : x.revoke.filter((r) => r !== p),
    }));
  };
  const groups = Object.keys(PERMISSIONS).reduce<Record<string, Permission[]>>((acc, p) => {
    const g = p.split(".")[0];
    (acc[g] ??= []).push(p as Permission);
    return acc;
  }, {});
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial); setPassword(""); save.reset(); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <UserPlus /> Add staff
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        size="lg"
        title={id ? `Edit ${initial.name}` : "Add staff member"}
        description={id ? undefined : "They sign in with this email and the temporary password you set. Ask them to change it after signing in."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={() => save.run(id ?? null, { ...v, defaultBranchId: v.defaultBranchId || null, calendarColor: v.calendarColor || null }, password)}>
              {id ? "Save" : "Add staff member"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" required value={v.name} onChange={(e) => set("name", e.target.value)} error={save.fe("name")} />
          <TextField label="Email" type="email" required value={v.email} onChange={(e) => set("email", e.target.value)} error={save.fe("email")} />
          {!id ? <TextField label="Temporary password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} error={save.fe("password")} hint="At least 10 characters with a letter and a number." className="sm:col-span-2" /> : null}
          <SelectField label="Role" value={v.role} onChange={(e) => set("role", e.target.value as Role)} hint={ROLE_SUMMARY[v.role]}>
            {ROLES.filter((r) => r !== "owner" || canMakeOwner || initial.role === "owner").map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </SelectField>
          <TextField label="Job title" value={v.title} onChange={(e) => set("title", e.target.value)} />
          <SelectField label="Home branch" value={v.defaultBranchId} onChange={(e) => set("defaultBranchId", e.target.value)}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </SelectField>
          <TextField label="Phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Checkbox label="Takes appointments" description="Appears as a practitioner in the calendar and booking slots." checked={v.takesAppointments} onChange={(e) => set("takesAppointments", e.target.checked)} />
            {id ? <Checkbox label="Active" description="Inactive staff can't sign in and are signed out immediately." checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> : null}
          </div>
          {v.role !== "owner" ? (
            <details className="rounded-[12px] border border-line sm:col-span-2" open={v.grant.length + v.revoke.length > 0}>
              <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium">
                Permissions {v.grant.length + v.revoke.length ? <span className="text-text-3">· {v.grant.length} added, {v.revoke.length} removed from the {ROLE_LABELS[v.role]} defaults</span> : <span className="text-text-3">· role defaults</span>}
              </summary>
              <div className="grid gap-x-6 gap-y-3 border-t border-line p-3 sm:grid-cols-2">
                {Object.entries(groups).map(([g, perms]) => (
                  <div key={g}>
                    <p className="mb-1 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase">{g}</p>
                    {perms
                      .filter((p) => p !== "demo.reset")
                      .map((p) => {
                        const changed = v.grant.includes(p) || v.revoke.includes(p);
                        return (
                          <label key={p} className={cn("flex items-center gap-2 py-0.5 text-[12.5px]", changed && "font-medium")}>
                            <input type="checkbox" checked={effective(p)} onChange={(e) => toggle(p, e.target.checked)} className="size-3.5 accent-[var(--ink)]" />
                            {PERMISSIONS[p]}
                            {changed ? <span className="text-[10.5px] text-info">custom</span> : null}
                          </label>
                        );
                      })}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <div className="sm:col-span-2"><FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null} /></div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function EditStaffButton(props: Omit<Parameters<typeof StaffFormDialog>[0], "trigger">) {
  return <StaffFormDialog {...props} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${props.initial.name}`}><Pencil /></Button>} />;
}

export function TempPasswordButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const act = useAction(setTemporaryPasswordAction, { onSuccess: () => setOpen(false) });
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPw(""); act.reset(); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Set temporary password for ${name}`}>
          <KeyRound />
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Set temporary password"
        description={`For ${name}. Use this when they're locked out and email isn't configured.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={act.pending} onClick={() => act.run(id, pw)}>Set password</Button>
          </>
        }
      >
        <TextField label="Temporary password" value={pw} onChange={(e) => setPw(e.target.value)} error={act.fe("password") ?? act.error} hint="At least 10 characters with a letter and a number." />
      </DialogContent>
    </DialogRoot>
  );
}
