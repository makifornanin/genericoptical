"use client";

import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormError, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { archiveCustomerAction, saveCustomerAction, savePrescriptionAction } from "./actions";

export type CustomerFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: string;
  addressLine1: string;
  city: string;
  notes: string;
  source: string;
  status: "active" | "inactive";
  homeBranchId: string;
  marketingConsent: boolean;
  smsConsent: boolean;
};

const EMPTY: CustomerFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  gender: "",
  addressLine1: "",
  city: "",
  notes: "",
  source: "walk_in",
  status: "active",
  homeBranchId: "",
  marketingConsent: false,
  smsConsent: false,
};

export function CustomerFormDialog({
  id,
  initial,
  branches,
  trigger,
  onSaved,
}: {
  id?: string;
  initial?: Partial<CustomerFormValues>;
  branches: { id: string; name: string }[];
  trigger?: ReactNode;
  onSaved?: (c: { id: string; code: string; firstName: string; lastName: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<CustomerFormValues>({ ...EMPTY, ...initial });
  const router = useRouter();
  const save = useAction(saveCustomerAction, {
    onSuccess: (c) => {
      setOpen(false);
      if (onSaved) onSaved(c);
      else if (!id) router.push(`/app/customers/${c.id}`);
    },
  });
  const set = <K extends keyof CustomerFormValues>(k: K, val: CustomerFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV({ ...EMPTY, ...initial });
          save.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <Plus /> New customer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={id ? "Edit customer" : "New customer"}
        description="Contact details and preferences. Clinical records are kept separately under Prescriptions."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.pending} onClick={() => save.run(id ?? null, v)}>
              {id ? "Save changes" : "Add customer"}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(id ?? null, v);
          }}
        >
          <TextField label="First name" required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} error={save.fe("firstName")} autoFocus />
          <TextField label="Last name" required value={v.lastName} onChange={(e) => set("lastName", e.target.value)} error={save.fe("lastName")} />
          <TextField label="Mobile number" type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={save.fe("phone")} placeholder="+63 9xx xxx xxxx" />
          <TextField label="Email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} error={save.fe("email")} />
          <TextField label="Date of birth" type="date" value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} error={save.fe("birthDate")} />
          <SelectField label="Home branch" value={v.homeBranchId} onChange={(e) => set("homeBranchId", e.target.value)}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Address" value={v.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} className="sm:col-span-2" />
          <TextField label="City" value={v.city} onChange={(e) => set("city", e.target.value)} />
          <SelectField label="How they found us" value={v.source} onChange={(e) => set("source", e.target.value)}>
            {[
              ["walk_in", "Walk-in"],
              ["referral", "Referral"],
              ["website", "Website"],
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
              ["other", "Other"],
            ].map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextareaField label="Notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} className="sm:col-span-2" />
          {id ? (
            <SelectField label="Status" value={v.status} onChange={(e) => set("status", e.target.value as "active" | "inactive")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          ) : null}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Checkbox label="SMS updates" description="Order-ready and appointment reminders by text." checked={v.smsConsent} onChange={(e) => set("smsConsent", e.target.checked)} />
            <Checkbox label="Marketing messages" description="Promotions and new collections." checked={v.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
          </div>
          <div className="sm:col-span-2">
            <FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null} />
          </div>
          <button type="submit" className="hidden" />
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function EditCustomerButton(props: { id: string; initial: Partial<CustomerFormValues>; branches: { id: string; name: string }[] }) {
  return (
    <CustomerFormDialog
      {...props}
      onSaved={() => {}}
      trigger={
        <Button>
          <Pencil /> Edit
        </Button>
      }
    />
  );
}

export function ArchiveCustomerButton({ id, archived }: { id: string; archived: boolean }) {
  const act = useAction(archiveCustomerAction);
  return (
    <ConfirmDialog
      trigger={
        <Button variant={archived ? "secondary" : "danger"}>
          {archived ? <RotateCcw /> : <Archive />} {archived ? "Restore" : "Archive"}
        </Button>
      }
      title={archived ? "Restore this customer?" : "Archive this customer?"}
      description={archived ? "They'll appear in searches and lists again." : "Archived customers are hidden from lists but their history is kept. Customers with open orders or balances can't be archived."}
      confirmLabel={archived ? "Restore" : "Archive"}
      tone={archived ? "primary" : "danger"}
      onConfirm={async () => (await act.run(id, !archived)).ok}
    />
  );
}

type Rx = {
  kind: "spectacles" | "contact_lens";
  examinedOn: string;
  expiresOn: string;
  practitionerMembershipId: string;
  odSphere: string;
  odCylinder: string;
  odAxis: string;
  odAdd: string;
  osSphere: string;
  osCylinder: string;
  osAxis: string;
  osAdd: string;
  pdDistance: string;
  notes: string;
};

export function PrescriptionDialog({ customerId, practitioners, today }: { customerId: string; practitioners: { id: string; name: string }[]; today: string }) {
  const empty: Rx = { kind: "spectacles", examinedOn: today, expiresOn: "", practitionerMembershipId: "", odSphere: "", odCylinder: "", odAxis: "", odAdd: "", osSphere: "", osCylinder: "", osAxis: "", osAdd: "", pdDistance: "", notes: "" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Rx>(empty);
  const save = useAction(savePrescriptionAction, { onSuccess: () => setOpen(false) });
  const set = (k: keyof Rx, val: string) => setV((p) => ({ ...p, [k]: val }));
  const eye = (label: string, prefix: "od" | "os") => (
    <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] items-end gap-2">
      <span className="pb-2 text-[12.5px] font-semibold">{label}</span>
      {(["Sphere", "Cylinder", "Axis", "Add"] as const).map((f) => {
        const key = `${prefix}${f}` as keyof Rx;
        return <TextField key={key} label={f} inputMode="decimal" value={v[key]} onChange={(e) => set(key, e.target.value)} error={save.fe(key)} placeholder={f === "Axis" ? "0–180" : "±0.00"} />;
      })}
    </div>
  );
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(empty); save.reset(); } }}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus /> Record prescription
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Record prescription"
        description="Clinical record — visible only to roles with prescription access."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={() => save.run(null, { ...v, customerId })}>Save prescription</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <SelectField label="Type" value={v.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="spectacles">Spectacles</option>
              <option value="contact_lens">Contact lenses</option>
            </SelectField>
            <TextField label="Examined on" type="date" value={v.examinedOn} onChange={(e) => set("examinedOn", e.target.value)} error={save.fe("examinedOn")} />
            <TextField label="Expires on" type="date" value={v.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} />
            <SelectField label="Practitioner" value={v.practitionerMembershipId} onChange={(e) => set("practitionerMembershipId", e.target.value)}>
              <option value="">Me</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectField>
          </div>
          {eye("OD", "od")}
          {eye("OS", "os")}
          <div className="grid gap-4 sm:grid-cols-4">
            <TextField label="PD (mm)" inputMode="decimal" value={v.pdDistance} onChange={(e) => set("pdDistance", e.target.value)} error={save.fe("pdDistance")} />
            <TextareaField label="Notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} className="sm:col-span-3" />
          </div>
          <FormError message={save.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
