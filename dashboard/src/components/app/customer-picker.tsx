"use client";

import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { posCustomerSearchAction } from "@/app/app/pos/actions";
import { CustomerFormDialog } from "@/app/app/customers/forms";
import { Avatar } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export type PickedCustomer = { id: string; name: string; code: string; phone?: string | null };

/** Search-as-you-type customer lookup with inline "new customer". */
export function CustomerPicker({
  value,
  onChange,
  branches,
  canCreate,
  required,
  compact,
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  branches: { id: string; name: string }[];
  canCreate: boolean;
  required?: boolean;
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ id: string; code: string; firstName: string; lastName: string; phone: string | null; email: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const search = (term: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      const res = await posCustomerSearchAction(term);
      setLoading(false);
      if (res.ok) setResults(res.data);
    }, 220);
  };

  if (value) {
    return (
      <div className={cn("flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3", compact ? "py-2" : "py-2.5")}>
        <Avatar name={value.name} size={30} color="#4d7a2e" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">{value.name}</p>
          <p className="truncate text-[12px] text-text-3">
            {value.code}
            {value.phone ? ` · ${value.phone}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove customer" className="flex size-7 items-center justify-center rounded-full text-text-3 hover:bg-muted-soft hover:text-text">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" />
          <Input
            value={q}
            placeholder={required ? "Find customer (required)…" : "Find customer by name or phone…"}
            aria-label="Find customer"
            className="pl-9"
            onFocus={() => {
              setOpen(true);
              if (!results.length) search(q);
            }}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              search(e.target.value);
            }}
          />
        </div>
        {canCreate ? (
          <CustomerFormDialog
            branches={branches}
            onSaved={(c) => onChange({ id: c.id, name: `${c.firstName} ${c.lastName}`, code: c.code })}
            trigger={
              <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-2" aria-label="New customer">
                <UserPlus className="size-4" /> New
              </button>
            }
          />
        ) : null}
      </div>
      {open ? (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-[12px] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]" role="listbox">
          {loading && !results.length ? <li className="px-3 py-2 text-[12.5px] text-text-3">Searching…</li> : null}
          {!loading && !results.length ? <li className="px-3 py-2 text-[12.5px] text-text-3">No customers found.</li> : null}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-surface-2"
                onClick={() => {
                  onChange({ id: c.id, name: `${c.firstName} ${c.lastName}`, code: c.code, phone: c.phone });
                  setOpen(false);
                  setQ("");
                }}
              >
                <Avatar name={`${c.firstName} ${c.lastName}`} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="block truncate text-[11.5px] text-text-3">
                    {c.code}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
