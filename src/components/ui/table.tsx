import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Builds a URL with updated query parameters (undefined/"" removes a key). */
export function hrefWith(pathname: string, params: SearchParams, patch: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scroll-thin overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />;
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-y border-line bg-canvas/70">{children}</tr>
    </thead>
  );
}

export function TH({ className, align = "left", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 px-4 text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-text-3 uppercase first:pl-5 last:pr-5",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

/** Sortable column header driven by `sort`/`dir` query params. */
export function SortTH({
  label,
  column,
  pathname,
  params,
  align = "left",
  defaultDir = "asc",
  className,
}: {
  label: string;
  column: string;
  pathname: string;
  params: SearchParams;
  align?: "left" | "right";
  defaultDir?: "asc" | "desc";
  className?: string;
}) {
  const active = params.sort === column;
  const dir = active ? (params.dir === "asc" ? "asc" : "desc") : null;
  const next = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH align={align} className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={hrefWith(pathname, params, { sort: column, dir: next, page: null })}
        className={cn("inline-flex items-center gap-1 hover:text-text", active && "text-text", align === "right" && "flex-row-reverse")}
        scroll={false}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden="true" />
      </Link>
    </TH>
  );
}

export function TR({ className, href, ...props }: HTMLAttributes<HTMLTableRowElement> & { href?: string }) {
  return <tr className={cn("border-b border-line last:border-b-0 hover:bg-surface-2", href && "cursor-pointer", className)} {...props} />;
}

export function TD({ className, align = "left", ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "h-11 px-4 align-middle first:pl-5 last:pr-5",
        align === "right" ? "text-right tabular" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-[13.5px] text-text-3">
        {children}
      </td>
    </tr>
  );
}

export function Pagination({ pathname, params, page, pageCount, total, pageSize }: { pathname: string; params: SearchParams; page: number; pageCount: number; total: number; pageSize: number }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-[9px] border border-line-strong bg-surface px-2.5 text-[12.5px] font-medium hover:bg-surface-2";
  const disabledCls = "pointer-events-none opacity-40";
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-text-2" aria-label="Pagination">
      <p className="tabular">
        Showing <span className="font-medium text-text">{from.toLocaleString()}</span>–<span className="font-medium text-text">{to.toLocaleString()}</span> of{" "}
        <span className="font-medium text-text">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Link href={hrefWith(pathname, params, { page: page - 1 > 1 ? page - 1 : null })} className={cn(linkCls, page <= 1 && disabledCls)} aria-disabled={page <= 1} scroll={false}>
          <ChevronLeft className="size-3.5" aria-hidden="true" /> Previous
        </Link>
        <span className="px-1.5 tabular">
          {page} / {pageCount}
        </span>
        <Link href={hrefWith(pathname, params, { page: page + 1 })} className={cn(linkCls, page >= pageCount && disabledCls)} aria-disabled={page >= pageCount} scroll={false}>
          Next <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
