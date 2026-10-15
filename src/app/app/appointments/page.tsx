import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, format, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { hrefWith, type SearchParams } from "@/components/ui/table";
import { WEEKDAYS } from "@/lib/types";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { appointmentTypesFor, listAppointments, practitioners as listPractitioners } from "@/server/services/appointments";
import { can, isUuid } from "@/server/services/core";
import { leads } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { AppointmentFormDialog } from "./appointment-form";
import { Calendar, type CalAppt } from "./calendar";

const PATH = "/app/appointments";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "appointments.view")) return <Forbidden what="appointments" />;
  const sp = await searchParams;
  const tz = session.business.timezone;
  const view = (["day", "week", "month", "list"].includes(str(sp.view) ?? "") ? str(sp.view) : "week") as "day" | "week" | "month" | "list";
  const todayKey = format(new TZDate(new Date(), tz), "yyyy-MM-dd");
  const anchorKey = str(sp.date) && DAY_RE.test(str(sp.date)!) ? str(sp.date)! : todayKey;
  const [y, m, d] = anchorKey.split("-").map(Number);
  const anchor = new TZDate(y, m - 1, d, tz);
  const mondayOf = (x: TZDate) => addDays(x, -((x.getDay() + 6) % 7));

  let start: TZDate;
  let end: TZDate;
  let prevKey: string;
  let nextKey: string;
  let title: string;
  if (view === "day") {
    start = anchor;
    end = addDays(anchor, 1);
    prevKey = format(addDays(anchor, -1), "yyyy-MM-dd");
    nextKey = format(addDays(anchor, 1), "yyyy-MM-dd");
    title = format(anchor, "EEEE, MMM d, yyyy");
  } else if (view === "month") {
    const first = startOfMonth(anchor);
    start = mondayOf(first);
    const last = addMonths(first, 1);
    end = addDays(mondayOf(addDays(last, -1)), 7);
    prevKey = format(addMonths(first, -1), "yyyy-MM-dd");
    nextKey = format(last, "yyyy-MM-dd");
    title = format(first, "MMMM yyyy");
  } else {
    start = mondayOf(anchor);
    end = addDays(start, view === "list" ? 14 : 7);
    prevKey = format(addDays(start, view === "list" ? -14 : -7), "yyyy-MM-dd");
    nextKey = format(end, "yyyy-MM-dd");
    title = `${format(start, "MMM d")} – ${format(addDays(end, -1), "MMM d, yyyy")}`;
  }

  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  const branchId = str(sp.branch) ?? selectedBranchId;
  const [rows, types, staff] = await Promise.all([
    listAppointments(ctx, { from: new Date(start.getTime()), to: new Date(end.getTime()), branchId, practitionerId: str(sp.practitioner) ?? null, limit: 2000 }),
    appointmentTypesFor(getDb(), session.business.id),
    listPractitioners(getDb(), session.business.id),
  ]);

  const toMin = (dt: Date) => {
    const z = new TZDate(dt, tz);
    return z.getHours() * 60 + z.getMinutes();
  };
  const appts: CalAppt[] = rows.map((a) => ({
    id: a.id,
    dayKey: format(new TZDate(a.startsAt, tz), "yyyy-MM-dd"),
    startMin: toMin(a.startsAt),
    endMin: toMin(a.endsAt) || 24 * 60,
    timeLabel: `${format(new TZDate(a.startsAt, tz), "h:mm")}–${format(new TZDate(a.endsAt, tz), "h:mm a")}`,
    status: a.status,
    typeName: a.typeName,
    typeId: a.typeId,
    branchId: a.branchId,
    branchName: a.branchName,
    personName: a.customerName ?? a.leadName ?? a.guestName ?? "Guest",
    personHref: a.customerId ? `/app/customers/${a.customerId}` : a.leadId ? `/app/leads/${a.leadId}` : null,
    phone: a.customerPhone ?? a.guestPhone,
    customerId: a.customerId,
    customerCode: null,
    leadId: a.leadId,
    practitionerId: a.practitionerMembershipId,
    practitionerName: a.practitionerName,
    color: a.practitionerColor,
    notes: a.notes,
    source: a.source,
    date: format(new TZDate(a.startsAt, tz), "yyyy-MM-dd"),
    time: format(new TZDate(a.startsAt, tz), "HH:mm"),
  }));

  const days: { key: string; label: string; inMonth?: boolean }[] = [];
  for (let cur = start; cur < end; cur = addDays(cur, 1)) days.push({ key: format(cur, "yyyy-MM-dd"), label: format(cur, view === "week" ? "EEE d" : "EEE, MMM d"), inMonth: view === "month" ? cur.getMonth() === anchor.getMonth() : true });

  const hours = session.business.businessHours;
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const open = WEEKDAYS.map((w) => hours[w]).filter(Boolean) as { open: string; close: string }[];
  const openMin = Math.min(...open.map((h) => toM(h.open)), ...appts.map((a) => a.startMin));
  const closeMin = Math.max(...open.map((h) => toM(h.close)), ...appts.map((a) => a.endMin));

  const selfOnly = !can(ctx, "appointments.view_all");
  const visibleStaff = staff.filter((p) => (selfOnly ? p.id === ctx.membershipId : true)).filter((p) => !branchId || !p.branchId || p.branchId === branchId);
  const options = {
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    types: types.map((t) => ({ id: t.id, name: t.name, durationMinutes: t.durationMinutes, requiresPractitioner: t.requiresPractitioner })),
    practitioners: staff.filter((p) => (selfOnly ? p.id === ctx.membershipId : true)).map((p) => ({ id: p.id, name: p.name, branchId: p.branchId })),
    canCreateCustomer: can(ctx, "customers.manage"),
    selfOnlyId: selfOnly ? ctx.membershipId : null,
  };

  let leadPrefill: { id: string; name: string; branchId: string | null } | null = null;
  if (typeof sp.lead === "string" && isUuid(sp.lead) && can(ctx, "leads.view")) {
    const [l] = await getDb()
      .select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName, branchId: leads.preferredBranchId, assigned: leads.assignedMembershipId })
      .from(leads)
      .where(and(eq(leads.businessId, session.business.id), eq(leads.id, sp.lead)))
      .limit(1);
    // Only leads this person may see (sales staff see their assigned leads).
    if (l && (can(ctx, "leads.view_all") || l.assigned === ctx.membershipId)) leadPrefill = { id: l.id, name: `${l.firstName} ${l.lastName}`, branchId: l.branchId };
  }
  const defaultBranch = leadPrefill?.branchId ?? branchId ?? session.membership.defaultBranchId ?? branches[0]?.id ?? "";
  const defaultType = types[0];
  const initial = {
    branchId: defaultBranch,
    appointmentTypeId: defaultType?.id ?? "",
    practitionerMembershipId: selfOnly ? ctx.membershipId ?? "" : staff.find((p) => p.branchId === defaultBranch)?.id ?? "",
    customer: null,
    leadId: leadPrefill?.id ?? null,
    leadName: leadPrefill?.name ?? null,
    guestName: "",
    guestPhone: "",
    date: anchorKey < todayKey ? todayKey : anchorKey,
    time: "",
    notes: "",
  };

  const nav = (key: string) => hrefWith(PATH, sp, { date: key === todayKey ? null : key });
  const counts = { active: appts.filter((a) => a.status === "scheduled" || a.status === "confirmed").length, completed: appts.filter((a) => a.status === "completed").length };

  return (
    <PageBody>
      <Toolbar actions={can(ctx, "appointments.manage") ? <AppointmentFormDialog options={options} initial={initial} defaultOpen={sp.new === "1"} /> : null}>
        <Segmented
          pathname={PATH}
          params={sp}
          param="view"
          options={[
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
            { value: "month", label: "Month" },
            { value: "list", label: "List" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Link href={nav(prevKey)} className={buttonClass("secondary", "icon")} aria-label="Previous" scroll={false}>
            <ChevronLeft />
          </Link>
          <Link href={nav(todayKey)} className={buttonClass("secondary", "md")} scroll={false}>
            Today
          </Link>
          <Link href={nav(nextKey)} className={buttonClass("secondary", "icon")} aria-label="Next" scroll={false}>
            <ChevronRight />
          </Link>
        </div>
        <p className="text-[14px] font-semibold">{title}</p>
        <ParamSelect param="branch" label="Branch" options={[{ value: "", label: selectedBranchId ? "Selected branch" : "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        {!selfOnly ? <ParamSelect param="practitioner" label="Practitioner" options={[{ value: "", label: "All practitioners" }, ...staff.map((p) => ({ value: p.id, label: p.name }))]} /> : null}
      </Toolbar>
      <p className="-mt-1 text-[12.5px] text-text-3">
        {counts.active} upcoming / open · {counts.completed} completed in view · times in {tz.replace("_", " ")}
      </p>
      <Calendar
        view={view}
        days={days}
        appointments={appts}
        practitioners={visibleStaff.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        openMin={openMin}
        closeMin={closeMin}
        todayKey={todayKey}
        options={options}
        canManage={can(ctx, "appointments.manage")}
      />
    </PageBody>
  );
}

export default function AppointmentsPage(props: PageProps<"/app/appointments">) {
  return (
    <>
      <PageHeader title="Appointments" subtitle="Eye exams, contact lens fittings and consultations across branches." />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
