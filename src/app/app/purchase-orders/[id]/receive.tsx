"use client";

import { Ban, CheckCheck, PackageOpen, Send } from "lucide-react";
import { useState } from "react";
import { newKey, useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { FormError, Input, TextareaField } from "@/components/ui/form";
import { cancelPoAction, closePoAction, confirmPoAction, receivePoAction } from "../actions";

export function ReceiveDialog({ poId, items }: { poId: string; items: { id: string; name: string; sku: string; ordered: number; received: number }[] }) {
  const outstanding = items.filter((i) => i.received < i.ordered);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState(newKey());
  const act = useAction(receivePoAction, { onSuccess: () => setOpen(false) });
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQty(Object.fromEntries(outstanding.map((i) => [i.id, i.ordered - i.received])));
          setNotes("");
          setKey(newKey());
          act.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent">
          <PackageOpen /> Receive delivery
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Receive delivery"
        description="Enter what actually arrived. Each line adds stock through a receipt movement and updates average cost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="accent"
              loading={act.pending}
              disabled={!Object.values(qty).some((q) => q > 0)}
              onClick={() => act.run({ purchaseOrderId: poId, items: Object.entries(qty).map(([itemId, quantity]) => ({ itemId, quantity })), notes, idempotencyKey: key })}
            >
              Receive into stock
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-[0.06em] text-text-3 uppercase">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Ordered</th>
                <th className="py-2 text-right">Already received</th>
                <th className="py-2 text-right">Receiving now</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="py-2">
                    <span className="font-medium">{i.name}</span>
                    <div className="font-mono text-[11px] text-text-3">{i.sku}</div>
                  </td>
                  <td className="py-2 text-right tabular">{i.ordered}</td>
                  <td className="py-2 text-right tabular text-text-2">{i.received}</td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={i.ordered - i.received}
                      aria-label={`Quantity received for ${i.name}`}
                      value={qty[i.id] ?? 0}
                      onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(i.ordered - i.received, Number(e.target.value))) }))}
                      className="ml-auto h-8 w-20 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TextareaField label="Delivery notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivery receipt #, damaged boxes, partial shipment" />
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function PoActions({ id, status, canApprove, canManage }: { id: string; status: string; canApprove: boolean; canManage: boolean }) {
  const confirm = useAction(confirmPoAction);
  const cancel = useAction(cancelPoAction);
  const close = useAction(closePoAction);
  return (
    <>
      {status === "draft" && canApprove ? (
        <Button variant="primary" loading={confirm.pending} onClick={() => confirm.run(id)}>
          <Send /> Confirm with supplier
        </Button>
      ) : null}
      {(status === "draft" || status === "ordered") && canManage ? (
        <ConfirmDialog
          trigger={
            <Button variant="danger">
              <Ban /> Cancel PO
            </Button>
          }
          title="Cancel this purchase order?"
          requireReason
          reasonLabel="Reason"
          confirmLabel="Cancel purchase order"
          onConfirm={async (reason) => (await cancel.run(id, reason)).ok}
        />
      ) : null}
      {status === "partially_received" && canManage ? (
        <ConfirmDialog
          trigger={
            <Button>
              <CheckCheck /> Close short
            </Button>
          }
          title="Close without the remaining items?"
          description="Use this when the supplier won't deliver the rest. Received stock stays in inventory."
          requireReason
          tone="primary"
          confirmLabel="Close purchase order"
          onConfirm={async (reason) => (await close.run(id, reason)).ok}
        />
      ) : null}
    </>
  );
}
