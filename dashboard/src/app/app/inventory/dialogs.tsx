"use client";

import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { newKey, useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { adjustStockAction, transferStockAction } from "./actions";

type Loc = { id: string; name: string; onHand?: number; reserved?: number };

const MODES = [
  { value: "add", label: "Add stock", hint: "Found units, returns from display, supplier freebies." },
  { value: "remove", label: "Remove stock", hint: "Lost, given away, used in-store." },
  { value: "damage", label: "Record damage", hint: "Broken or unsellable units." },
  { value: "set", label: "Stock count", hint: "Set the counted quantity; the difference is recorded." },
] as const;

export function AdjustStockDialog({ variantId, label, locations, defaultLocationId, trigger }: { variantId: string; label: string; locations: Loc[]; defaultLocationId?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("add");
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey());
  const act = useAction(adjustStockAction, { onSuccess: () => setOpen(false) });
  const loc = locations.find((l) => l.id === locationId);
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMode("add");
          setQuantity("1");
          setReason("");
          setKey(newKey());
          act.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <SlidersHorizontal /> Adjust
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Adjust stock"
        description={label}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={act.pending} disabled={!reason.trim()} onClick={() => act.run({ variantId, locationId, mode, quantity: Number(quantity), reason, idempotencyKey: key })}>
              Save adjustment
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Adjustment type">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn("rounded-[10px] border px-3 py-2 text-left", mode === m.value ? "border-ink bg-surface-2" : "border-line hover:border-line-strong")}
              >
                <span className="block text-[13px] font-medium">{m.label}</span>
                <span className="block text-[11.5px] text-text-3">{m.hint}</span>
              </button>
            ))}
          </div>
          <SelectField label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.onHand !== undefined ? ` — ${l.onHand} on hand${l.reserved ? `, ${l.reserved} reserved` : ""}` : ""}
              </option>
            ))}
          </SelectField>
          <TextField
            label={mode === "set" ? "Counted quantity" : "Quantity"}
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={act.fe("quantity")}
            hint={loc?.onHand !== undefined ? `Currently ${loc.onHand} on hand${loc.reserved ? ` (${loc.reserved} reserved for orders)` : ""}.` : undefined}
          />
          <TextareaField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Every stock change needs a reason — it's kept in the movement history." error={act.fe("reason")} />
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function TransferStockDialog({ variantId, label, locations, trigger }: { variantId: string; label: string; locations: Loc[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(locations[0]?.id ?? "");
  const [to, setTo] = useState(locations[1]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("Rebalancing between branches");
  const [key, setKey] = useState(newKey());
  const act = useAction(transferStockAction, { onSuccess: () => setOpen(false) });
  if (locations.length < 2) return null;
  const src = locations.find((l) => l.id === from);
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setKey(newKey()); act.reset(); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <ArrowLeftRight /> Transfer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Transfer stock"
        description={label}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={act.pending} onClick={() => act.run({ variantId, fromLocationId: from, toLocationId: to, quantity: Number(quantity), reason, idempotencyKey: key })}>
              Transfer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </SelectField>
            <SelectField label="To" value={to} onChange={(e) => setTo(e.target.value)} error={act.fe("toLocationId")}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </SelectField>
          </div>
          <TextField label="Quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} hint={src?.onHand !== undefined ? `${(src.onHand ?? 0) - (src.reserved ?? 0)} available at ${src.name}.` : undefined} />
          <TextareaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
