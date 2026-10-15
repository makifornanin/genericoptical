import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/misc";

/** Static page title block; lives outside Suspense so it renders in the static shell. */
export function PageHeader({ title, subtitle, children, eyebrow }: { title: string; subtitle?: string; children?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-col gap-3 px-4 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-8 lg:pt-7">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="font-display text-[24px] leading-tight font-semibold sm:text-[26px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-text-2">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4 px-4 pb-10 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** Toolbar row inside a page: filters on the left, actions on the right. */
export function Toolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Forbidden({ what = "this page" }: { what?: string }) {
  return (
    <PageBody>
      <div className="flex flex-col items-center rounded-[14px] border border-line bg-surface px-6 py-16 text-center">
        <Lock className="mb-3 size-6 text-text-3" aria-hidden="true" />
        <p className="text-[15px] font-semibold">You don&apos;t have access to {what}</p>
        <p className="mt-1 max-w-md text-[13.5px] text-text-2">Your role doesn&apos;t include this permission. Ask an owner to adjust your access in Staff settings.</p>
      </div>
    </PageBody>
  );
}

export function TableSkeleton({ rows = 8, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <PageBody>
      {toolbar ? (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
      ) : null}
      <div className="rounded-[14px] border border-line bg-surface">
        <div className="h-9 border-b border-line bg-canvas/70" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </PageBody>
  );
}

export function CardsSkeleton() {
  return (
    <PageBody>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-[14px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-[14px] lg:col-span-2" />
        <Skeleton className="h-[320px] rounded-[14px]" />
      </div>
    </PageBody>
  );
}
