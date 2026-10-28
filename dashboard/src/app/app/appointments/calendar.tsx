"use client";

import { CalendarClock, Check, CheckCheck, Clock, MapPin, Phone, User, UserX, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppointmentPill } from "@/components/app/status";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { AppointmentFormDialog, type ApptOptions } from "./appointment-form";
import { setAppointmentStatusAction } from "./actions";

export type CalAppt = {
  id: string;
  dayKey: string;
  startMin: number;
  endMin: number;
  timeLabel: string;
  status: string;
  typeName: string;
  typeId: string;
  branchId: string;
  branchName: string;
  personName: string;
  personHref: string | null;
  phone: string | null;
  customerId: string | null;
  customerCode: string | null;
  leadId: string | null;
  practitionerId: string | null;
  practitionerName: string | null;
  color: string | null;
  notes: string | null;
  source: string;
  date: string;
  time: string;
};

const HOUR_PX = 64;
const STATUS_STYLE: Record<string, string> = {
  scheduled: "border-l-text-3 bg-surface",
  confirmed: "border-l-[#4d3fb0] bg-info-soft/60",
  completed: "border-l-pos bg-pos-soft/70",
  cancelled: "border-l-line-strong bg-muted-soft text-text-3 line-through",
  no_show: "border-l-neg bg-neg-soft/70",
};

function minutesLabel(m: number) {
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
}

function Block({ a, onOpen, compact }: { a: CalAppt; onOpen: (a: CalAppt) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className={cn("flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-l-[3px] border-line px-2 py-1 text-left text-[11.5px] leading-tight shadow-[0_1px_0_rgb(24_25_27/0.04)] hover:border-line-strong", STATUS_STYLE[a.status] ?? "bg-surface")}
      style={a.practitionerId && a.color && a.status !== "cancelled" ? { borderLeftColor: a.color } : undefined}
    >
      <span className="truncate font-semibold">
        {a.personName}
        {compact ? <span className="font-normal text-text-2"> · {a.timeLabel.split("–")[0]}</span> : null}
      </span>
      {!compact ? (
        <span className="truncate text-text-2">
          {a.timeLabel} · {a.typeName}
        </span>
      ) : null}
    </button>
  );
}

export function Calendar({
  view,
  days,
  appointments,
  practitioners,
  openMin,
  closeMin,
  todayKey,
  options,
  canManage,
}: {
  view: "day" | "week" | "month" | "list";
  days: { key: string; label: string; inMonth?: boolean }[];
  appointments: CalAppt[];
  practitioners: { id: string; name: string; color: string | null }[];
  openMin: number;
  closeMin: number;
  todayKey: string;
  options: ApptOptions;
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<CalAppt | null>(null);
  const hours = [] as number[];
  for (let m = Math.floor(openMin / 60) * 60; m < closeMin; m += 60) hours.push(m);
  const gridHeight = ((closeMin - Math.floor(openMin / 60) * 60) / 60) * HOUR_PX;
  const top = (m: number) => ((m - Math.floor(openMin / 60) * 60) / 60) * HOUR_PX;

  const columns =
    view === "day"
      ? [...practitioners.map((p) => ({ key: p.id, label: p.name, filter: (a: CalAppt) => a.practitionerId === p.id })), { key: "none", label: "No practitioner", filter: (a: CalAppt) => !a.practitionerId }]
      : days.map((d) => ({ key: d.key, label: d.label, filter: (a: CalAppt) => a.dayKey === d.key }));

  return (
    <>
      {view === "month" ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-canvas/70">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-3 py-2 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = appointments.filter((a) => a.dayKey === d.key && a.status !== "cancelled");
              return (
                <div key={d.key} className={cn("min-h-[112px] border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0", !d.inMonth && "bg-canvas/60")}>
                  <p className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-[12px] font-medium tabular", d.key === todayKey ? "bg-ink text-white" : d.inMonth ? "text-text" : "text-text-3")}>{Number(d.key.slice(8))}</p>
                  <div className="flex flex-col gap-1">
                    {list.slice(0, 3).map((a) => (
                      <div key={a.id} className="h-[22px]">
                        <Block a={a} onOpen={setSelected} compact />
                      </div>
                    ))}
                    {list.length > 3 ? <p className="px-1 text-[11px] text-text-3">+{list.length - 3} more</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          {appointments.length === 0 ? <p className="px-5 py-12 text-center text-[13px] text-text-3">No appointments in this range.</p> : null}
          <ul className="divide-y divide-line">
            {appointments.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setSelected(a)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-2">
                  <div className="w-28 shrink-0">
                    <p className="text-[12px] text-text-3">{days.find((d) => d.key === a.dayKey)?.label ?? a.dayKey}</p>
                    <p className="text-[13.5px] font-semibold tabular">{a.timeLabel}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{a.personName}</p>
                    <p className="truncate text-[12px] text-text-3">
                      {a.typeName} · {a.branchName}
                      {a.practitionerName ? ` · ${a.practitionerName}` : ""}
                    </p>
                  </div>
                  <AppointmentPill status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-[14px] border border-line bg-surface">
          <div className="min-w-[760px]">
            <div className="sticky top-0 z-10 grid border-b border-line bg-canvas/95" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
              <div />
              {columns.map((c) => (
                <div key={c.key} className={cn("border-l border-line px-2 py-2 text-[12px] font-medium", view === "week" && c.key === todayKey && "text-ink")}>
                  <span className={cn(view === "week" && c.key === todayKey && "rounded-full bg-ink px-2 py-0.5 text-white")}>{c.label}</span>
                  <span className="ml-1 text-text-3">{appointments.filter((a) => c.filter(a) && a.status !== "cancelled").length || ""}</span>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-text-3 tabular" style={{ top: top(h) }}>
                    {h === hours[0] ? "" : minutesLabel(h)}
                  </span>
                ))}
              </div>
              {columns.map((c) => {
                const list = appointments.filter(c.filter);
                return (
                  <div key={c.key} className="relative border-l border-line" style={{ height: gridHeight }}>
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: top(h) }} />
                    ))}
                    {list.map((a) => {
                      // Simple overlap handling: side-by-side for overlapping non-practitioner bookings.
                      const overlapping = list.filter((b) => b.startMin < a.endMin && b.endMin > a.startMin);
                      const idx = overlapping.findIndex((b) => b.id === a.id);
                      const width = 100 / overlapping.length;
                      return (
                        <div
                          key={a.id}
                          className="absolute px-0.5"
                          style={{ top: top(a.startMin) + 1, height: Math.max(22, top(a.endMin) - top(a.startMin) - 2), left: `${idx * width}%`, width: `${width}%` }}
                        >
                          <Block a={a} onOpen={setSelected} compact={a.endMin - a.startMin < 40} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {selected ? <AppointmentPanel a={selected} onClose={() => setSelected(null)} options={options} canManage={canManage} /> : null}
    </>
  );
}

function AppointmentPanel({ a, onClose, options, canManage }: { a: CalAppt; onClose: () => void; options: ApptOptions; canManage: boolean }) {
  const act = useAction(setAppointmentStatusAction, { onSuccess: onClose });
  const [rescheduling, setRescheduling] = useState(false);
  const active = a.status === "scheduled" || a.status === "confirmed";
  return (
    <>
      <DialogRoot open={!rescheduling} onOpenChange={(o) => !o && onClose()}>
        <DialogContent side title={a.personName} description={`${a.typeName} · ${a.timeLabel}`}>
          <div className="flex flex-col gap-4">
            <AppointmentPill status={a.status} />
            <ul className="flex flex-col gap-2 text-[13.5px]">
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-text-3" /> {a.date} · {a.timeLabel}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-text-3" /> {a.branchName}
              </li>
              <li className="flex items-center gap-2">
                <User className="size-4 text-text-3" /> {a.practitionerName ?? "No practitioner assigned"}
              </li>
              {a.phone ? (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-text-3" /> <a href={`tel:${a.phone}`} className="hover:underline">{a.phone}</a>
                </li>
              ) : null}
            </ul>
            {a.personHref ? (
              <Link href={a.personHref} className="text-[13px] font-medium underline underline-offset-4">
                Open {a.customerId ? "customer profile" : "lead"}
              </Link>
            ) : null}
            {a.notes ? <p className="rounded-[10px] bg-surface-2 p-3 text-[13px] text-text-2">{a.notes}</p> : null}
            <p className="text-[12px] text-text-3">Booked via {a.source}.</p>
            {canManage ? (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                {a.status === "scheduled" ? (
                  <Button variant="secondary" loading={act.pending} onClick={() => act.run(a.id, "confirmed")}>
                    <Check /> Mark confirmed
                  </Button>
                ) : null}
                {active ? (
                  <>
                    <Button variant="primary" loading={act.pending} onClick={() => act.run(a.id, "completed")}>
                      <CheckCheck /> Mark completed
                    </Button>
                    <Button onClick={() => setRescheduling(true)}>
                      <CalendarClock /> Reschedule / edit
                    </Button>
                    <Button loading={act.pending} onClick={() => act.run(a.id, "no_show")}>
                      <UserX /> No-show
                    </Button>
                    <ConfirmDialog trigger={<Button variant="danger"><X /> Cancel appointment</Button>} title="Cancel this appointment?" requireReason confirmLabel="Cancel appointment" onConfirm={async (reason) => (await act.run(a.id, "cancelled", reason)).ok} />
                  </>
                ) : (
                  <Button onClick={() => act.run(a.id, "scheduled")} loading={act.pending}>
                    Reopen
                  </Button>
                )}
                {a.status === "completed" && a.customerId ? (
                  <Link href={`/app/pos?customer=${a.customerId}`} className="text-center text-[13px] font-medium text-text-2 hover:text-text">
                    Ring up exam / sale at the POS
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </DialogRoot>
      {rescheduling ? (
        <AppointmentFormDialog
          id={a.id}
          defaultOpen
          options={options}
          onClose={() => {
            setRescheduling(false);
            onClose();
          }}
          initial={{
            branchId: a.branchId,
            appointmentTypeId: a.typeId,
            practitionerMembershipId: a.practitionerId ?? "",
            customer: a.customerId ? { id: a.customerId, name: a.personName, code: a.customerCode ?? "" } : null,
            leadId: a.customerId ? null : a.leadId,
            leadName: a.personName,
            guestName: !a.customerId && !a.leadId ? a.personName : "",
            guestPhone: a.phone ?? "",
            date: a.date,
            time: a.time,
            notes: a.notes ?? "",
          }}
        />
      ) : null}
    </>
  );
}
