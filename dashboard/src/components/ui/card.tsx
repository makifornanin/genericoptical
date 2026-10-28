import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, inverted, ...props }: HTMLAttributes<HTMLDivElement> & { inverted?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[14px] border",
        inverted ? "border-ink bg-ink text-white" : "border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
  as: As = "h2",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <As className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">{title}</As>
        {subtitle ? <p className="mt-0.5 text-[12.5px] text-text-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

/** Key/value rows for detail panels. */
export function DetailList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-[13.5px]", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-text-2">{it.label}</dt>
          <dd className="min-w-0 text-right font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
