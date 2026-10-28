"use client";

import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { FormError, TextareaField, TextField } from "@/components/ui/form";
import { archiveSupplierAction, saveSupplierAction } from "../purchase-orders/actions";

type V = { code: string; name: string; contactName: string; email: string; phone: string; address: string; paymentTerms: string; leadTimeDays: string; notes: string };
const EMPTY: V = { code: "", name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "", leadTimeDays: "", notes: "" };

export function SupplierFormDialog({ id, initial, trigger }: { id?: string; initial?: Partial<V>; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>({ ...EMPTY, ...initial });
  const router = useRouter();
  const save = useAction(saveSupplierAction, {
    onSuccess: (r) => {
      setOpen(false);
      if (!id) router.push(`/app/suppliers/${r.id}`);
    },
  });
  const set = (k: keyof V, val: string) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => save.run(id ?? null, { ...v, leadTimeDays: v.leadTimeDays === "" ? null : Number(v.leadTimeDays), isActive: true });
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV({ ...EMPTY, ...initial }); save.reset(); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <Plus /> New supplier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={id ? "Edit supplier" : "New supplier"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.pending} onClick={submit}>{id ? "Save" : "Add supplier"}</Button>
          </>
        }
      >
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <TextField label="Code" required value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} error={save.fe("code")} placeholder="e.g. NWT" />
          <TextField label="Supplier name" required value={v.name} onChange={(e) => set("name", e.target.value)} error={save.fe("name")} className="sm:col-span-2" />
          <TextField label="Contact person" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
          <TextField label="Email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} error={save.fe("email")} />
          <TextField label="Phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={save.fe("phone")} />
          <TextField label="Payment terms" value={v.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30" />
          <TextField label="Lead time (days)" type="number" min={0} value={v.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} />
          <TextField label="Address" value={v.address} onChange={(e) => set("address", e.target.value)} />
          <TextareaField label="Notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} className="sm:col-span-3" />
          <div className="sm:col-span-3"><FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error : null} /></div>
          <button type="submit" className="hidden" />
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function EditSupplierButton({ id, initial }: { id: string; initial: Partial<V> }) {
  return <SupplierFormDialog id={id} initial={initial} trigger={<Button><Pencil /> Edit</Button>} />;
}

export function ArchiveSupplierButton({ id, archived }: { id: string; archived: boolean }) {
  const act = useAction(archiveSupplierAction);
  return (
    <ConfirmDialog
      trigger={<Button variant={archived ? "secondary" : "danger"}>{archived ? <RotateCcw /> : <Archive />} {archived ? "Restore" : "Archive"}</Button>}
      title={archived ? "Restore supplier?" : "Archive supplier?"}
      description={archived ? undefined : "Archived suppliers can't receive new purchase orders. Their history is kept."}
      tone={archived ? "primary" : "danger"}
      confirmLabel={archived ? "Restore" : "Archive"}
      onConfirm={async () => (await act.run(id, !archived)).ok}
    />
  );
}
