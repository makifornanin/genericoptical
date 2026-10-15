import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Delta } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/menu";

/** Compact metric tile. `inverted` is the single ink anchor tile per row (STOCKPOS pattern). */
export function Kpi({
  label,
  value,
  delta,
  deltaInverse,
  caption,
  definition,
  inverted,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  deltaInverse?: boolean;
  caption?: ReactNode;
  definition?: string;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-between gap-3 rounded-[14px] border p-4", inverted ? "border-ink bg-ink text-white" : "border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[12.5px] font-medium", inverted ? "text-white/65" : "text-text-2")}>{label}</p>
        {definition ? (
          <Tooltip content={definition}>
            <button type="button" aria-label={`How ${label} is calculated`} className={cn("rounded-full", inverted ? "text-white/40 hover:text-white" : "text-text-3 hover:text-text")}>
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      <div>
        <p className="font-display text-[26px] leading-none font-semibold tabular">{value}</p>
        {delta !== undefined || caption ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {delta !== undefined ? <Delta value={delta} inverse={deltaInverse} /> : null}
            {caption ? <span className={cn("text-[11.5px]", inverted ? "text-white/50" : "text-text-3")}>{caption}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Dense strip of secondary metrics separated by hairlines (grid gap shows the line colour). */
export function MetricStrip({ items }: { items: { label: string; value: ReactNode; caption?: ReactNode; href?: string; tone?: "warning" | "negative" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {items.map((m) => {
        const body = (
          <>
            <p className="text-[12px] text-text-2">{m.label}</p>
            <p className={cn("mt-1 text-[19px] font-semibold tabular", m.tone === "warning" && "text-warn", m.tone === "negative" && "text-neg")}>{m.value}</p>
            {m.caption ? <p className="mt-0.5 truncate text-[11.5px] text-text-3">{m.caption}</p> : null}
          </>
        );
        const cls = "block bg-surface px-4 py-3";
        return m.href ? (
          <a key={m.label} href={m.href} className={cn(cls, "hover:bg-surface-2")}>
            {body}
          </a>
        ) : (
          <div key={m.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
