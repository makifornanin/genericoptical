import Link from "next/link";
import type { ReactNode } from "react";
import { cn, initials } from "@/lib/cn";
import { CountBadge } from "./pill";
import { hrefWith, type SearchParams } from "./table";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[8px] bg-muted-soft", className)} aria-hidden="true" />;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-text-3 [&_svg]:size-6">{icon}</div> : null}
      <p className="text-[14px] font-semibold">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-[13px] text-text-2">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, color, size = 28, className }: { name: string | null | undefined; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color ?? "#3a3d41" }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Segmented control as links (URL state), e.g. tabs over a list. */
export function Segmented({
  pathname,
  params,
  param,
  options,
  className,
}: {
  pathname: string;
  params: SearchParams;
  param: string;
  options: { value: string; label: string; count?: number }[];
  className?: string;
}) {
  const current = (params[param] as string | undefined) ?? options[0]?.value ?? "";
  return (
    <div className={cn("scroll-thin flex items-center gap-1 overflow-x-auto", className)} role="tablist">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <Link
            key={o.value}
            role="tab"
            aria-selected={active}
            scroll={false}
            href={hrefWith(pathname, params, { [param]: o.value === options[0].value ? null : o.value, page: null })}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
              active ? "bg-ink text-white" : "text-text-2 hover:bg-muted-soft hover:text-text",
            )}
          >
            {o.label}
            {o.count !== undefined ? <CountBadge active={active}>{o.count}</CountBadge> : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Period-over-period change. `inverse` = lower is better; `neutral` = direction carries no judgement (e.g. tax). */
export function Delta({ value, inverse, neutral, suffix = "%" }: { value: number | null | undefined; inverse?: boolean; neutral?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[11.5px] text-text-3">no prior data</span>;
  const good = inverse ? value < 0 : value > 0;
  const flat = value === 0 || neutral;
  return (
    <span
      className={cn(
        "inline-flex h-[20px] items-center rounded-full px-1.5 text-[11.5px] font-semibold tabular",
        flat ? "bg-muted-soft text-text-2" : good ? "bg-accent-soft text-[#3d5a12]" : "bg-neg-soft text-neg",
      )}
    >
      {value === 0 ? "±" : value > 0 ? "↑" : "↓"} {Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}
