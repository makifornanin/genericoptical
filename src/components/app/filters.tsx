"use client";

import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { RANGE_PRESETS } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

function useParamUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const update = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in patch)) sp.delete("page");
    const q = sp.toString();
    start(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

/** Debounced search box bound to the `q` query parameter. */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, update, pending } = useParamUpdater();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        className={cn("pl-9", pending && "opacity-70")}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => update({ [param]: v.trim() || null }), 300);
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-text-3 hover:bg-muted-soft hover:text-text"
          onClick={() => {
            setValue("");
            update({ [param]: null });
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Select bound to a query parameter. */
export function ParamSelect({ param, options, label, className }: { param: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const { params, update, pending } = useParamUpdater();
  const value = params.get(param) ?? "";
  return (
    <label className={cn("relative inline-flex", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => update({ [param]: e.target.value || null })}
        className={cn(
          "h-9 appearance-none rounded-[10px] border border-line-strong bg-surface pr-8 pl-3 text-[13px] font-medium hover:bg-surface-2 focus:border-ink focus:outline-none",
          pending && "opacity-70",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-text-3" aria-hidden="true" />
    </label>
  );
}

/** Date-range preset menu with a custom range option; writes `range`, `from`, `to`. */
export function DateRangeFilter({ label }: { label: string }) {
  const { params, update, pending } = useParamUpdater();
  const [custom, setCustom] = useState(params.get("range") === "custom");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Menu>
        <MenuTrigger className={cn("inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-2", pending && "opacity-70")}>
          <CalendarDays className="size-4 text-text-3" aria-hidden="true" />
          {pending ? "Updating…" : label}
          <ChevronDown className="size-3.5 text-text-3" aria-hidden="true" />
        </MenuTrigger>
        <MenuContent>
          {RANGE_PRESETS.filter((r) => r.value !== "custom").map((r) => (
            <MenuItem
              key={r.value}
              onSelect={() => {
                setCustom(false);
                update({ range: r.value === "30d" ? null : r.value, from: null, to: null });
              }}
            >
              {r.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setCustom(true)}>Custom range…</MenuItem>
        </MenuContent>
      </Menu>
      {custom ? (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) update({ range: "custom", from, to });
          }}
        >
          <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" required />
          <span className="text-text-3">–</span>
          <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" required />
          <Button type="submit" size="md" variant="primary" disabled={!from || !to}>
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
