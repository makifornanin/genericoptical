"use client";

import { ArrowRightLeft, CalendarClock, Pencil, Plus, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormError, Input, MoneyInput, SelectField, Textarea, TextareaField, TextField, Field } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { LEAD_INTEREST_LABELS, LEAD_INTERESTS, LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STAGE_LABELS, LEAD_STAGES, type LeadStage } from "@/lib/schemas";
import { addNoteAction, assignLeadAction, changeStageAction, convertLeadAction, duplicatesAction, saveLeadAction, setFollowUpAction } from "./actions";

type Option = { id: string; name: string };
export type LeadFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  interest: string;
  message: string;
  assignedMembershipId: string;
  preferredBranchId: string;
  followUpAt: string;
  estimatedValueCents: number | null;
  smsConsent: boolean;
  marketingConsent: boolean;
};

const EMPTY: LeadFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  source: "walk_in",
  interest: "eye_exam",
  message: "",
  assignedMembershipId: "",
  preferredBranchId: "",
  followUpAt: "",
  estimatedValueCents: null,
  smsConsent: false,
  marketingConsent: false,
};

/** datetime-local value → ISO with offset (the browser's zone). */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

export function LeadFormDialog({ id, initial, staff, branches, canAssign, trigger }: { id?: string; initial?: Partial<LeadFormValues>; staff: Option[]; branches: Option[]; canAssign: boolean; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  // `initial.followUpAt` is an ISO instant; the input shows it in the browser's local time.
  const fromInitial = (): LeadFormValues => ({ ...EMPTY, ...initial, followUpAt: initial?.followUpAt ? toLocalInput(initial.followUpAt) : "" });
  const [v, setV] = useState<LeadFormValues>(fromInitial);
  const router = useRouter();
  const save = useAction(saveLeadAction, {
    onSuccess: (r) => {
      setOpen(false);
      if (!id) router.push(`/app/leads/${r.id}`);
    },
  });
  const set = <K extends keyof LeadFormValues>(k: K, val: LeadFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => save.run(id ?? null, { ...v, followUpAt: toIso(v.followUpAt), interest: v.interest || null });
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(fromInitial()); save.reset(); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <Plus /> New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={id ? "Edit lead" : "New lead"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={submit}>{id ? "Save changes" : "Add lead"}</Button>
          </>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <TextField label="First name" required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} error={save.fe("firstName")} autoFocus />
          <TextField label="Last name" value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
          <TextField label="Mobile number" type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={save.fe("phone")} />
          <TextField label="Email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} error={save.fe("email")} />
          <SelectField label="Source" value={v.source} onChange={(e) => set("source", e.target.value)}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>)}
          </SelectField>
          <SelectField label="Interested in" value={v.interest} onChange={(e) => set("interest", e.target.value)}>
            {LEAD_INTERESTS.map((s) => <option key={s} value={s}>{LEAD_INTEREST_LABELS[s]}</option>)}
          </SelectField>
          <SelectField label="Preferred branch" value={v.preferredBranchId} onChange={(e) => set("preferredBranchId", e.target.value)}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </SelectField>
          {canAssign ? (
            <SelectField label="Assigned to" value={v.assignedMembershipId} onChange={(e) => set("assignedMembershipId", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
          ) : null}
          <TextField label="Follow up on" type="datetime-local" value={v.followUpAt} onChange={(e) => set("followUpAt", e.target.value)} />
          <Field label="Estimated value">
            <MoneyInput value={v.estimatedValueCents} onValueChange={(c) => set("estimatedValueCents", c)} />
          </Field>
          <TextareaField label="Message / notes" value={v.message} onChange={(e) => set("message", e.target.value)} className="sm:col-span-2" />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Checkbox label="SMS consent" checked={v.smsConsent} onChange={(e) => set("smsConsent", e.target.checked)} />
            <Checkbox label="Marketing consent" checked={v.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
          </div>
          <div className="sm:col-span-2"><FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null} /></div>
          <button type="submit" className="hidden" />
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function EditLeadButton(props: { id: string; initial: Partial<LeadFormValues>; staff: Option[]; branches: Option[]; canAssign: boolean }) {
  return <LeadFormDialog {...props} trigger={<Button><Pencil /> Edit</Button>} />;
}

/** Move a lead to another stage; "lost" asks for a reason. */
export function StageMenu({ id, stage, compact }: { id: string; stage: LeadStage; compact?: boolean }) {
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState("");
  const act = useAction(changeStageAction, { onSuccess: () => { setLostOpen(false); setReason(""); } });
  if (stage === "converted") return null;
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button size={compact ? "sm" : "md"} loading={act.pending}>
            <ArrowRightLeft /> Move stage
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Move to</MenuLabel>
          {LEAD_STAGES.filter((s) => s !== stage && s !== "converted").map((s) => (
            <MenuItem key={s} onSelect={() => (s === "lost" ? setLostOpen(true) : act.run(id, s))}>
              {LEAD_STAGE_LABELS[s]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <DialogRoot open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent
          size="sm"
          title="Mark lead as lost"
          footer={
            <>
              <Button variant="ghost" onClick={() => setLostOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={!reason.trim()} loading={act.pending} onClick={() => act.run(id, "lost", reason)}>Mark as lost</Button>
            </>
          }
        >
          <TextareaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Went with another shop" autoFocus />
        </DialogContent>
      </DialogRoot>
    </>
  );
}

export function AssignMenu({ id, staff, current }: { id: string; staff: Option[]; current: string | null }) {
  const act = useAction(assignLeadAction);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button loading={act.pending}>
          <UserCheck /> {staff.find((s) => s.id === current)?.name ?? "Assign"}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Assign to</MenuLabel>
        <MenuItem onSelect={() => act.run(id, null)}>Unassigned</MenuItem>
        {staff.map((s) => (
          <MenuItem key={s.id} onSelect={() => act.run(id, s.id)}>
            <span className={cn("size-1.5 rounded-full", s.id === current ? "bg-ink" : "bg-transparent")} /> {s.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function NoteComposer({ id }: { id: string }) {
  const [body, setBody] = useState("");
  const [type, setType] = useState<"note" | "call" | "sms" | "email">("note");
  const [followUp, setFollowUp] = useState("");
  const act = useAction(addNoteAction, { onSuccess: () => { setBody(""); setFollowUp(""); } });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(id, { body, type, followUpAt: followUp ? new Date(followUp).toISOString() : null });
      }}
    >
      <div className="flex gap-1" role="radiogroup" aria-label="Activity type">
        {(["note", "call", "sms", "email"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn("h-7 rounded-full px-2.5 text-[12px] font-medium", type === t ? "bg-ink text-white" : "text-text-2 hover:bg-muted-soft")}>
            {t === "note" ? "Note" : t === "call" ? "Call" : t === "sms" ? "SMS" : "Email"}
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={type === "call" ? "What was discussed?" : "Add a note…"} aria-label="Note" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-text-2">
          <CalendarClock className="size-4 text-text-3" /> Follow up
          <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="h-8 w-auto" />
        </label>
        <Button type="submit" variant="primary" size="sm" loading={act.pending} disabled={!body.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function FollowUpControl({ id, current }: { id: string; current: string | null }) {
  const [value, setValue] = useState(current ? toLocalInput(current) : "");
  const act = useAction(setFollowUpAction);
  return (
    <div className="flex items-center gap-2">
      <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-8" aria-label="Follow-up date" />
      <Button size="sm" loading={act.pending} onClick={() => act.run(id, value ? new Date(value).toISOString() : null)}>
        {value ? "Set" : "Clear"}
      </Button>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Shows matching customers before converting, so staff can link instead of duplicating. */
export function ConvertButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; code: string; firstName: string; lastName: string; email: string | null; phone: string | null }[] | null>(null);
  const router = useRouter();
  const lookup = useAction(duplicatesAction, { silent: true, onSuccess: (d) => setDupes(d) });
  const convert = useAction(convertLeadAction, {
    success: (r) => (r.created ? "Customer created from lead" : r.alreadyConverted ? "Lead was already converted" : "Lead linked to existing customer"),
    onSuccess: (r) => {
      setOpen(false);
      router.push(`/app/customers/${r.customerId}`);
    },
  });
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDupes(null); lookup.run(id); } }}>
      <DialogTrigger asChild>
        <Button variant="accent">
          <UserCheck /> Convert to customer
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" title="Convert to customer" description="The lead keeps its full history and is marked Converted.">
        {lookup.pending || dupes === null ? (
          <p className="text-[13px] text-text-3">Checking for existing customers…</p>
        ) : dupes.length ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-text-2">These customers share an email or phone number. Link to one to avoid a duplicate:</p>
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {dupes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 text-[13px]">
                    <p className="font-medium">{d.firstName} {d.lastName} <span className="text-text-3">· {d.code}</span></p>
                    <p className="truncate text-[12px] text-text-3">{[d.phone, d.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Button size="sm" loading={convert.pending} onClick={() => convert.run(id, d.id)}>Link</Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" onClick={() => convert.run(id, null)} loading={convert.pending}>Create a new customer anyway</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-text-2">No matching customers found. A new customer profile will be created with the lead&apos;s details.</p>
            <Button variant="primary" loading={convert.pending} onClick={() => convert.run(id, null)}>Create customer</Button>
          </div>
        )}
        <FormError message={convert.error} />
      </DialogContent>
    </DialogRoot>
  );
}

