"use client";

import { CalendarPlus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormError, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { saveAppointmentAction, slotsAction } from "./actions";

export type ApptOptions = {
  branches: { id: string; name: string }[];
  types: { id: string; name: string; durationMinutes: number; requiresPractitioner: boolean }[];
  practitioners: { id: string; name: string; branchId: string | null }[];
  canCreateCustomer: boolean;
  /** Practitioners without view-all can only book for themselves. */
  selfOnlyId?: string | null;
};

export type ApptInitial = {
  branchId: string;
  appointmentTypeId: string;
  practitionerMembershipId: string;
  customer: PickedCustomer | null;
  leadId: string | null;
  leadName?: string | null;
  guestName: string;
  guestPhone: string;
  date: string;
  time: string;
  notes: string;
};

export function AppointmentFormDialog({
  id,
  options,
  initial,
  trigger,
  defaultOpen,
  onClose,
}: {
  id?: string;
  options: ApptOptions;
  initial: ApptInitial;
  trigger?: ReactNode;
  defaultOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [v, setV] = useState<ApptInitial>(initial);
  const [loadedSlots, setLoadedSlots] = useState<{ key: string; slots: { time: string; practitionerIds: string[] }[] } | null>(null);
  const save = useAction(saveAppointmentAction, {
    onSuccess: () => {
      setOpen(false);
      onClose?.();
    },
  });
  const type = options.types.find((t) => t.id === v.appointmentTypeId);
  const staff = options.practitioners.filter((p) => !p.branchId || p.branchId === v.branchId || p.id === v.practitionerMembershipId);
  const set = <K extends keyof ApptInitial>(k: K, val: ApptInitial[K]) => setV((p) => ({ ...p, [k]: val }));

  const slotPractitioner = v.practitionerMembershipId || null;
  const slotKey = open && v.branchId && v.appointmentTypeId && v.date ? [v.branchId, v.appointmentTypeId, v.date, slotPractitioner ?? ""].join("|") : null;
  const slots = slotKey && loadedSlots?.key === slotKey ? loadedSlots.slots : null;
  useEffect(() => {
    if (!slotKey) return;
    let cancelled = false;
    slotsAction({ branchId: v.branchId, appointmentTypeId: v.appointmentTypeId, date: v.date, practitionerId: slotPractitioner }).then((r) => {
      if (!cancelled) setLoadedSlots({ key: slotKey, slots: r.ok ? r.data : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [slotKey, v.branchId, v.appointmentTypeId, v.date, slotPractitioner]);

  const submit = () =>
    save.run(id ?? null, {
      branchId: v.branchId,
      appointmentTypeId: v.appointmentTypeId,
      practitionerMembershipId: type?.requiresPractitioner ? v.practitionerMembershipId || null : v.practitionerMembershipId || null,
      customerId: v.customer?.id ?? null,
      leadId: v.leadId,
      guestName: v.customer || v.leadId ? null : v.guestName,
      guestPhone: v.customer || v.leadId ? null : v.guestPhone,
      date: v.date,
      time: v.time,
      notes: v.notes,
    });

  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial);
          save.reset();
        } else onClose?.();
      }}
    >
      {trigger !== undefined ? <DialogTrigger asChild>{trigger}</DialogTrigger> : !defaultOpen ? (
        <DialogTrigger asChild>
          <Button variant="primary">
            <CalendarPlus /> New appointment
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        size="lg"
        title={id ? "Reschedule appointment" : "New appointment"}
        description="Times are in the business time zone and must fit the branch's opening hours. A practitioner can't be double-booked."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={submit} disabled={!v.time}>
              {id ? "Save changes" : "Book appointment"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {v.leadId ? (
              <div className="rounded-[12px] border border-line bg-surface-2 px-3 py-2.5 text-[13px]">
                Booking for lead <span className="font-medium">{v.leadName ?? ""}</span> — the lead moves to “Appointment scheduled”.
              </div>
            ) : (
              <Field label="Customer" error={save.fe("customerId")}>
                <CustomerPicker value={v.customer} onChange={(c) => set("customer", c)} branches={options.branches} canCreate={options.canCreateCustomer} />
              </Field>
            )}
          </div>
          {!v.customer && !v.leadId ? (
            <>
              <TextField label="…or guest name" value={v.guestName} onChange={(e) => set("guestName", e.target.value)} hint="For first-time visitors without a profile yet." />
              <TextField label="Guest phone" value={v.guestPhone} onChange={(e) => set("guestPhone", e.target.value)} />
            </>
          ) : null}
          <SelectField label="Branch" value={v.branchId} onChange={(e) => set("branchId", e.target.value)}>
            {options.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </SelectField>
          <SelectField label="Appointment type" value={v.appointmentTypeId} onChange={(e) => set("appointmentTypeId", e.target.value)}>
            {options.types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.durationMinutes} min
              </option>
            ))}
          </SelectField>
          <SelectField
            label={type?.requiresPractitioner ? "Practitioner" : "Practitioner (optional)"}
            value={v.practitionerMembershipId}
            onChange={(e) => set("practitionerMembershipId", e.target.value)}
            error={save.fe("practitionerMembershipId")}
            disabled={Boolean(options.selfOnlyId)}
          >
            {!type?.requiresPractitioner ? <option value="">Any available staff</option> : <option value="">Choose…</option>}
            {staff.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </SelectField>
          <TextField label="Date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} error={save.fe("date")} />
          <div className="sm:col-span-2">
            <Field label="Time" error={save.fe("time")} hint={slots && slots.length === 0 ? "No free slots on this day — the branch may be closed or fully booked." : undefined}>
              <div className="flex flex-wrap gap-1.5">
                {slots === null ? <span className="text-[12.5px] text-text-3">Checking availability…</span> : null}
                {slots?.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => set("time", s.time)}
                    className={cn("h-8 rounded-[8px] border px-2.5 text-[12.5px] font-medium tabular", v.time === s.time ? "border-ink bg-ink text-white" : "border-line-strong hover:border-text-3")}
                  >
                    {s.time}
                  </button>
                ))}
                {v.time && slots && !slots.some((s) => s.time === v.time) ? <span className="inline-flex h-8 items-center rounded-[8px] border border-ink bg-ink px-2.5 text-[12.5px] font-medium text-white">{v.time}</span> : null}
              </div>
            </Field>
            <details className="mt-2 text-[12.5px] text-text-2">
              <summary className="cursor-pointer">Enter a time manually</summary>
              <TextField label="Time" type="time" step={300} value={v.time} onChange={(e) => set("time", e.target.value)} className="mt-2 w-40" />
            </details>
          </div>
          <TextareaField label="Notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <FormError message={save.error} />
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
