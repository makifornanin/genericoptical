"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { importProductsAction } from "./actions";

export function ImportProductsDialog({ columns }: { columns: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const act = useAction(importProductsAction, {
    success: (r) => `Imported: ${r.created} new variant(s), ${r.updated} updated`,
    onSuccess: () => setOpen(false),
  });
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setText(""); setName(""); act.reset(); } }}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Import
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import products from CSV"
        description="Rows with the same product name and brand become variants of one product. Existing SKUs are updated."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!text} loading={act.pending} onClick={() => act.run(text)}>Import</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[13px]">
          <p className="text-text-2">
            Columns: <code className="rounded bg-muted-soft px-1 font-mono text-[11.5px]">{columns.join(", ")}</code>
          </p>
          <p className="text-text-3">Stock quantities are never imported — receive stock through a purchase order so every unit has a movement record. Tip: export your catalogue first to get a ready-made template.</p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center hover:border-text-3">
            <Upload className="size-5 text-text-3" />
            <span className="font-medium">{name || "Choose a .csv file"}</span>
            <span className="text-[12px] text-text-3">Up to 2,000 rows</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setName(file.name);
                setText(await file.text());
              }}
            />
          </label>
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
