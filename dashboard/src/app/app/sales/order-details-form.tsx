"use client";

import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { TextareaField, TextField } from "@/components/ui/form";
import { updateOrderAction } from "./actions";

export function OrderDetailsForm({ saleId, initial }: { saleId: string; initial: { dueOn: string; labReference: string; notes: string } }) {
  const [v, setV] = useState(initial);
  const act = useAction(updateOrderAction);
  const dirty = v.dueOn !== initial.dueOn || v.labReference !== initial.labReference || v.notes !== initial.notes;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(saleId, { dueOn: v.dueOn || null, labReference: v.labReference || null, notes: v.notes || null });
      }}
    >
      <TextField label="Promised pickup date" type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} />
      <TextField label="Lab job reference" value={v.labReference} onChange={(e) => setV({ ...v, labReference: e.target.value })} />
      <TextareaField label="Notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      <Button type="submit" size="sm" variant="primary" disabled={!dirty} loading={act.pending} className="self-end">
        Save details
      </Button>
    </form>
  );
}
