import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "positive" | "warning" | "negative" | "info" | "accent" | "ink";

const tones: Record<Tone, string> = {
  neutral: "bg-muted-soft text-text-2",
  positive: "bg-pos-soft text-pos",
  warning: "bg-warn-soft text-warn",
  negative: "bg-neg-soft text-neg",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-ink",
  ink: "bg-ink text-white",
};

const dots: Record<Tone, string> = {
  neutral: "bg-text-3",
  positive: "bg-pos",
  warning: "bg-[#c48a12]",
  negative: "bg-neg",
  info: "bg-info",
  accent: "bg-[#7da628]",
  ink: "bg-white",
};

/** Small status label: text + tint, never color alone. */
export function Pill({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium", tones[tone], className)}>
      {dot ? <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function CountBadge({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular", active ? "bg-accent text-accent-ink" : "bg-muted-soft text-text-2")}>
      {children}
    </span>
  );
}
