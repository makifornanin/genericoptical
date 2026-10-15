"use client";

import { CalendarCheck2, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Checkbox, FormError, TextareaField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { WEEKDAYS, type WeekHours } from "@/lib/types";
import { bookAppointmentAction, publicSlotsAction } from "../actions";
import { siteButton } from "../site-ui";

type Branch = { id: string; name: string; address: string; hours: WeekHours };
type Type = { id: string; name: string; description: string | null; durationMinutes: number; price: string | null };

const DAYS_AHEAD = 21;

function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
function weekdayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  // getUTCDay: 0 = Sunday.
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7];
}
function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return {
    dow: dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    num: d,
    month: dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    long: dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
  };
}
function timeLabel(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-7 first:border-t-0 first:pt-0">
      <h2 className="mb-4 flex items-center gap-3 text-[15px] font-semibold text-text">
        <span className={cn("flex size-7 items-center justify-center rounded-full font-mono text-[12px]", done ? "bg-brand text-brand-ink" : "bg-muted-soft text-text-2")}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({ selected, onClick, children, disabled, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-[14px] border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-ink bg-surface shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line-strong bg-surface hover:border-text-3",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BookingForm({ branches, types, today, initialBranch, initialType }: { branches: Branch[]; types: Type[]; today: string; initialBranch?: string; initialType?: string }) {
  const [branchId, setBranchId] = useState(initialBranch && branches.some((b) => b.id === initialBranch) ? initialBranch : branches.length === 1 ? branches[0].id : "");
  const [typeId, setTypeId] = useState(initialType && types.some((t) => t.id === initialType) ? initialType : types.length === 1 ? types[0].id : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Slot results are keyed by the query they answer, so a stale response never shows for a new choice.
  const [loaded, setLoaded] = useState<{ key: string; slots: string[]; error: string | null } | null>(null);
  const [details, setDetails] = useState({ fullName: "", phone: "", email: "", message: "", smsConsent: false, marketingConsent: false, website: "" });
  const [booked, setBooked] = useState<{ startsAt: string | null; typeName: string | null; branchName: string | null } | null>(null);

  const branch = branches.find((b) => b.id === branchId);
  const type = types.find((t) => t.id === typeId);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)), [today]);

  const slotKey = branchId && typeId && date ? `${branchId}|${typeId}|${date}` : null;
  const current = slotKey && loaded?.key === slotKey ? loaded : null;
  const slots = current?.slots ?? null;
  const slotError = current?.error ?? null;
  const loadingSlots = Boolean(slotKey && !current);
  useEffect(() => {
    if (!slotKey) return;
    let cancelled = false;
    publicSlotsAction({ branchId, appointmentTypeId: typeId, date }).then((r) => {
      if (!cancelled) setLoaded({ key: slotKey, slots: r.ok ? r.data : [], error: r.ok ? null : r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [slotKey, branchId, typeId, date]);

  const { run, pending, error, fe } = useAction(bookAppointmentAction, {
    silent: true,
    onSuccess: (d) => setBooked(d),
  });

  if (booked) {
    return (
      <div role="status" className="rounded-[24px] border border-line bg-surface p-8 sm:p-10">
        <CalendarCheck2 className="size-8 text-pos" aria-hidden />
        <h2 className="mt-5 font-display text-[30px] font-semibold leading-tight">You&apos;re booked in.</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-text-2">
          {booked.typeName ?? "Your appointment"}
          {booked.branchName ? ` at our ${booked.branchName} branch` : ""}
          {date && time ? (
            <>
              {" "}
              on <strong className="font-semibold text-text">{dayLabel(date).long}</strong> at <strong className="font-semibold text-text">{timeLabel(time)}</strong>
            </>
          ) : null}
          . We&apos;ll contact you to confirm. If you need to change it, just call the branch.
        </p>
        <Link href="/" className={cn(siteButton("outline"), "mt-8")}>
          Back to home
        </Link>
      </div>
    );
  }

  const branchHours = branch?.hours;
  const ready = branchId && typeId && date && time;

  return (
    <form
      className="rounded-[24px] border border-line bg-surface p-6 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        run({ ...details, branchId, appointmentTypeId: typeId, date, time, email: details.email || null, message: details.message || null });
      }}
      noValidate
    >
      {branches.length > 1 ? (
        <Step n={1} title="Choose a branch" done={!!branchId}>
          <div className="grid gap-3 sm:grid-cols-3">
            {branches.map((b) => (
              <Choice key={b.id} selected={b.id === branchId} onClick={() => (setBranchId(b.id), setDate(""), setTime(""))} className="p-4">
                <span className="block text-[15px] font-semibold text-text">{b.name}</span>
                <span className="mt-1 block text-[12.5px] leading-snug text-text-3">{b.address}</span>
              </Choice>
            ))}
          </div>
        </Step>
      ) : null}

      <Step n={branches.length > 1 ? 2 : 1} title="Choose a service" done={!!typeId}>
        <div className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <Choice key={t.id} selected={t.id === typeId} onClick={() => (setTypeId(t.id), setTime(""))} className="p-4">
              <span className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold text-text">{t.name}</span>
                {t.price ? <span className="shrink-0 text-[13.5px] text-text-2 tabular">{t.price}</span> : null}
              </span>
              <span className="mt-1 flex items-center gap-1 text-[12.5px] text-text-3">
                <Clock className="size-3.5" aria-hidden /> {t.durationMinutes} min
              </span>
            </Choice>
          ))}
        </div>
      </Step>

      <Step n={branches.length > 1 ? 3 : 2} title="Pick a date and time" done={!!(date && time)}>
        {!branchId || !typeId ? (
          <p className="text-[14px] text-text-3">Choose {!branchId ? "a branch" : ""}{!branchId && !typeId ? " and " : ""}{!typeId ? "a service" : ""} first.</p>
        ) : (
          <>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Date">
              {days.map((d) => {
                const closed = branchHours ? !branchHours[weekdayOf(d)] : false;
                const l = dayLabel(d);
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={d === date}
                    aria-label={`${l.long}${closed ? " (closed)" : ""}`}
                    disabled={closed}
                    onClick={() => (setDate(d), setTime(""))}
                    className={cn(
                      "flex w-[60px] shrink-0 flex-col items-center rounded-[14px] border py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                      d === date ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:border-text-3",
                    )}
                  >
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{l.dow}</span>
                    <span className="font-display text-[20px] font-semibold leading-tight tabular">{l.num}</span>
                    <span className="text-[11px] opacity-70">{l.month}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 min-h-[56px]" aria-live="polite">
              {!date ? (
                <p className="text-[14px] text-text-3">Select a day to see open times.</p>
              ) : loadingSlots ? (
                <p className="text-[14px] text-text-3">Checking availability…</p>
              ) : slotError ? (
                <p className="text-[14px] text-neg">{slotError}</p>
              ) : slots && slots.length === 0 ? (
                <p className="text-[14px] text-text-2">No open times that day — try another date or call the branch.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Time">
                  {slots?.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={s === time}
                      onClick={() => setTime(s)}
                      className={cn("h-10 rounded-[10px] border text-[13.5px] tabular transition-colors", s === time ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:border-text-3")}
                    >
                      {timeLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Step>

      <Step n={branches.length > 1 ? 4 : 3} title="Your details">
        <div className="grid gap-4">
          <TextField label="Full name" required autoComplete="name" value={details.fullName} onChange={(e) => setDetails((d) => ({ ...d, fullName: e.target.value }))} error={fe("fullName")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Mobile number" required type="tel" autoComplete="tel" value={details.phone} onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))} error={fe("phone")} />
            <TextField label="Email" type="email" autoComplete="email" value={details.email} onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))} error={fe("email")} />
          </div>
          <TextareaField label="Anything we should know?" rows={3} placeholder="e.g. current glasses, symptoms, contact lens history" value={details.message} onChange={(e) => setDetails((d) => ({ ...d, message: e.target.value }))} />
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={details.website} onChange={(e) => setDetails((d) => ({ ...d, website: e.target.value }))} />
            </label>
          </div>
          <div className="grid gap-2.5">
            <Checkbox label="Text me appointment reminders" checked={details.smsConsent} onChange={(e) => setDetails((d) => ({ ...d, smsConsent: e.target.checked }))} />
            <Checkbox label="Send me occasional offers and eye-care reminders" checked={details.marketingConsent} onChange={(e) => setDetails((d) => ({ ...d, marketingConsent: e.target.checked }))} />
          </div>
        </div>
      </Step>

      <FormError message={error} />
      <div className="mt-2 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] text-text-2">
          {ready && type && branch ? (
            <>
              <span className="font-medium text-text">{type.name}</span> · {branch.name} · {dayLabel(date).long}, {timeLabel(time)}
            </>
          ) : (
            "Choose a service, date and time to continue."
          )}
        </p>
        <button type="submit" disabled={!ready || pending} className={cn(siteButton("brand", "lg"), "disabled:cursor-not-allowed disabled:opacity-50")} aria-busy={pending || undefined}>
          {pending ? "Booking…" : "Request appointment"}
        </button>
      </div>
    </form>
  );
}
