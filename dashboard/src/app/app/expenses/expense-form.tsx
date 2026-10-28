"use client";

import { Ban, Paperclip, Pencil, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormError, Input, MoneyInput, SelectField, TextField } from "@/components/ui/form";
import { createExpenseCategoryAction, saveExpenseAction, voidExpenseAction } from "./actions";

type V = { categoryId: string; branchId: string; amountCents: number | null; expenseDate: string; paymentMethod: string; payee: string; description: string; reference: string };

export function ExpenseFormDialog({
  id,
  initial,
  categories,
  branches,
  trigger,
  hasAttachment,
}: {
  id?: string;
  initial: V;
  categories: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  trigger?: ReactNode;
  hasAttachment?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [cats, setCats] = useState(categories);
  const [newCat, setNewCat] = useState("");
  const save = useAction(saveExpenseAction, { onSuccess: () => setOpen(false) });
  const addCat = useAction(createExpenseCategoryAction, {
    onSuccess: (c) => {
      setCats((x) => [...x, c]);
      setV((p) => ({ ...p, categoryId: c.id }));
      setNewCat("");
    },
  });
  const set = <K extends keyof V>(k: K, val: V[K]) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => {
    const fd = new FormData();
    fd.set("data", JSON.stringify({ ...v, amountCents: v.amountCents ?? 0, branchId: v.branchId || null }));
    if (file) fd.set("attachment", file);
    save.run(id ?? null, fd);
  };
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial); setFile(null); save.reset(); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <Plus /> Record expense
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={id ? "Edit expense" : "Record expense"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={submit}>{id ? "Save" : "Record expense"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Description" required value={v.description} onChange={(e) => set("description", e.target.value)} error={save.fe("description")} className="sm:col-span-2" autoFocus />
          <Field label="Amount" required error={save.fe("amountCents")}>
            <MoneyInput value={v.amountCents} onValueChange={(c) => set("amountCents", c)} />
          </Field>
          <TextField label="Date" type="date" required value={v.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} error={save.fe("expenseDate")} />
          <SelectField label="Category" required value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} error={save.fe("categoryId")}>
            <option value="">Choose…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <Field label="New category">
            <div className="flex gap-2">
              <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Insurance" />
              <Button onClick={() => addCat.run(newCat)} disabled={!newCat.trim()} loading={addCat.pending}>Add</Button>
            </div>
          </Field>
          <SelectField label="Branch" value={v.branchId} onChange={(e) => set("branchId", e.target.value)}>
            <option value="">Business-wide</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </SelectField>
          <SelectField label="Paid by" value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
            {["bank_transfer", "cash", "card", "gcash", "maya", "check", "other"].map((m) => (
              <option key={m} value={m}>{m.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
            ))}
          </SelectField>
          <TextField label="Payee" value={v.payee} onChange={(e) => set("payee", e.target.value)} />
          <TextField label="Reference / OR number" value={v.reference} onChange={(e) => set("reference", e.target.value)} />
          <Field label="Attachment (optional)" hint={hasAttachment && !file ? "A file is already attached; choosing a new one replaces it." : "PDF, JPG, PNG or WebP, up to 5 MB."} className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[13px] text-text-2 hover:border-text-3">
              <Paperclip className="size-4" />
              {file ? file.name : "Choose receipt or invoice"}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
          <div className="sm:col-span-2"><FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null} /></div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function EditExpenseButton(props: Omit<Parameters<typeof ExpenseFormDialog>[0], "trigger">) {
  return <ExpenseFormDialog {...props} trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit expense"><Pencil /></Button>} />;
}

export function VoidExpenseButton({ id }: { id: string }) {
  const act = useAction(voidExpenseAction);
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="icon-sm" aria-label="Void expense"><Ban /></Button>}
      title="Void this expense?"
      description="Voided expenses stay in the history but no longer count in reports."
      requireReason
      confirmLabel="Void expense"
      onConfirm={async (reason) => (await act.run(id, reason)).ok}
    />
  );
}
