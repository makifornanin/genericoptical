"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

const GRID = "#eeeeea";
const AXIS = "#86888d";

type Money = { currency: string; locale: string };

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[170px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-medium text-text">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-text-2">
            {r.color ? <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden="true" /> : null}
            {r.label}
          </span>
          <span className="font-medium text-text tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export type RevenuePoint = { label: string; current: number; previous: number; profit: number; transactions: number };

/** Net sales per bucket (bars) against the previous period (muted line). One axis, both in money. */
export function RevenueChart({ data, money, height = 260, label = "Net sales" }: { data: RevenuePoint[]; money: Money; height?: number; label?: string }) {
  const fmtCompact = (v: number) => formatMoney(v, money.currency, money.locale, { compact: true });
  const fmt = (v: number) => formatMoney(v, money.currency, money.locale);
  const hasData = data.some((d) => d.current || d.previous);
  if (!hasData) return <p className="flex h-[200px] items-center justify-center text-[13px] text-text-3">No completed sales in this period yet.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12px] text-text-2" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-series-1" /> {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-series-muted" /> Previous period
        </span>
      </div>
      <div style={{ height }} role="img" aria-label={`${label} per period compared with the previous period`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={fmtCompact} width={64} />
            <Tooltip
              cursor={{ fill: "rgba(24,25,27,0.04)" }}
              content={(p) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0].payload as RevenuePoint;
                return (
                  <TooltipBox
                    title={d.label}
                    rows={[
                      { label, value: fmt(d.current), color: "var(--series-1)" },
                      ...(label === "Gross profit" ? [] : [{ label: "Gross profit", value: fmt(d.profit) }]),
                      { label: "Transactions", value: d.transactions.toLocaleString() },
                      { label: "Previous period", value: fmt(d.previous), color: "var(--series-muted)" },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="current" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line dataKey="previous" type="monotone" stroke="var(--series-muted)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Two series on one money axis (e.g. net sales vs expenses). */
export function TwoSeriesChart({
  data,
  money,
  a,
  b,
  height = 260,
}: {
  data: { label: string; a: number; b: number }[];
  money: Money;
  a: string;
  b: string;
  height?: number;
}) {
  const fmt = (v: number) => formatMoney(v, money.currency, money.locale);
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12px] text-text-2" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-series-1" /> {a}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-series-3" /> {b}
        </span>
      </div>
      <div style={{ height }} role="img" aria-label={`${a} and ${b} per period`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="26%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(v: number) => formatMoney(v, money.currency, money.locale, { compact: true })} width={64} />
            <Tooltip
              cursor={{ fill: "rgba(24,25,27,0.04)" }}
              content={(p) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0].payload as { label: string; a: number; b: number };
                return (
                  <TooltipBox
                    title={d.label}
                    rows={[
                      { label: a, value: fmt(d.a), color: "var(--series-1)" },
                      { label: b, value: fmt(d.b), color: "var(--series-3)" },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="a" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            <Bar dataKey="b" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Small single-series column chart (counts). */
export function CountColumns({ data, height = 180, label }: { data: { label: string; value: number }[]; height?: number; label: string }) {
  if (!data.some((d) => d.value)) return <p className="flex items-center justify-center text-[13px] text-text-3" style={{ height }}>Nothing recorded in this period.</p>;
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={40} />
          <Tooltip
            cursor={{ fill: "rgba(24,25,27,0.04)" }}
            content={(p) =>
              p.active && p.payload?.length ? <TooltipBox title={String(p.label)} rows={[{ label, value: String(p.payload[0].value), color: "var(--series-1)" }]} /> : null
            }
          />
          <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars rendered in HTML: every value is visible as text. */
export function BarList({
  items,
  valueFormat = "number",
  money,
  emptyText = "No data for this period.",
  max: maxOverride,
}: {
  items: { label: string; value: number; sub?: string; href?: string }[];
  /** Serializable format name (functions can't be passed from Server Components). */
  valueFormat?: "number" | "money" | "compactMoney";
  money?: Money;
  emptyText?: string;
  max?: number;
}) {
  if (!items.length) return <p className="py-8 text-center text-[13px] text-text-3">{emptyText}</p>;
  const max = maxOverride ?? Math.max(...items.map((i) => i.value), 1);
  const format =
    valueFormat === "number" || !money
      ? null
      : (v: number) => formatMoney(v, money.currency, money.locale, { compact: valueFormat === "compactMoney" });
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">
              {it.href ? (
                <a href={it.href} className="hover:underline">
                  {it.label}
                </a>
              ) : (
                it.label
              )}
              {it.sub ? <span className="ml-1.5 text-[12px] text-text-3">{it.sub}</span> : null}
            </span>
            <span className="shrink-0 font-medium tabular">{format ? format(it.value) : it.value.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted-soft">
            <div className="h-full rounded-full bg-series-1" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const FUNNEL_RAMP = ["#9bb87a", "#7c9f58", "#5f863d", "#466c28", "#2f5418"];

/** Ordered stages as an ordinal ramp, with step-to-step conversion. */
export function Funnel({ stages }: { stages: { stage: string; count: number }[] }) {
  const top = stages[0]?.count ?? 0;
  if (!top) return <p className="py-8 text-center text-[13px] text-text-3">No new leads in this period.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const pct = Math.round((s.count / top) * 100);
        const step = i > 0 && stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 100) : null;
        return (
          <li key={s.stage} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[13px]">
            <span className="text-text-2">{s.stage}</span>
            <div className="h-6 overflow-hidden rounded-[6px] bg-muted-soft">
              <div className="flex h-full items-center rounded-[6px] px-2 text-[11.5px] font-semibold text-white" style={{ width: `${Math.max(pct, 6)}%`, background: FUNNEL_RAMP[i] ?? FUNNEL_RAMP[4] }}>
                {pct >= 14 ? `${pct}%` : ""}
              </div>
            </div>
            <span className="w-16 text-right tabular">
              <span className="font-medium">{s.count}</span>
              {step !== null ? <span className="ml-1 text-[11.5px] text-text-3">{step}%</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Part-to-whole status split as one segmented bar, with a legend (never colour alone). */
export function SegmentBar({ segments, total: totalOverride }: { segments: { label: string; value: number; color: string }[]; total?: number }) {
  const total = totalOverride ?? segments.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-muted-soft" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {total > 0 ? segments.filter((s) => s.value > 0).map((s) => <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />) : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-text-2">
              <span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </span>
            <span className={cn("font-medium tabular", !s.value && "text-text-3")}>{s.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
