"use client";

import type { ReactNode } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { archiveProductAction } from "../actions";

export function ArchiveProductButton({ id, archived, icon }: { id: string; archived: boolean; icon: ReactNode }) {
  const act = useAction(archiveProductAction);
  return (
    <ConfirmDialog
      trigger={
        <Button variant={archived ? "secondary" : "danger"}>
          {icon} {archived ? "Restore" : "Archive"}
        </Button>
      }
      title={archived ? "Restore this product?" : "Archive this product?"}
      description={
        archived
          ? "It becomes sellable again."
          : "Archived products disappear from the catalogue and point of sale but stay on past sales. Products with stock on hand or reserved for orders can't be archived."
      }
      confirmLabel={archived ? "Restore" : "Archive"}
      tone={archived ? "primary" : "danger"}
      onConfirm={async () => (await act.run(id, !archived)).ok}
    />
  );
}
