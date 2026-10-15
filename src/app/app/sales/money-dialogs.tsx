"use client";

import { Ban, ChevronRight, CircleDollarSign, Undo2 } from "lucide-react";
import { useState } from "react";
import { newKey, useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, MoneyInput, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type FulfillmentStage } from "@/lib/schemas";
import { cancelSaleAction, recordPaymentAction, refundAction, transitionOrderAction, voidPaymentAction } from "./actions";

type Money = { currency: string; locale: string };

export function RecordPaymentDialog({ saleId, balanceCents, money }: { saleId: string; balanceCents: number; money: Money }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [amount, setAmount] = useState<number | null>(balanceCents);
  const [tendered, setTendered] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState(newKey());
  const act = useAction(recordPaymentAction, { onSuccess: () => setOpen(false) });
  const fmt = (c: number) => formatMoney(c, money.currency, money.locale);
  const change = method === "cash" && tendered !== null && amount !== null ? tendered - amount : 0;
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMethod("cash");
          setAmount(balanceCents);
          setTendered(null);
          setReference("");
          setNotes("");
          setKey(newKey());
          act.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent">
          <CircleDollarSign /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Record payment"
        description={`Balance due: ${fmt(balanceCents)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="accent" loading={act.pending} disabled={!amount || amount <= 0} onClick={() => act.run({ saleId, method, amountCents: amount ?? 0, tenderedCents: method === "cash" ? tendered : null, reference: reference || null, notes: notes || null, idempotencyKey: key })}>
              Record {amount ? fmt(amount) : ""}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </SelectField>
          <Field label="Amount" error={act.fe("amountCents")}>
            <MoneyInput value={amount} onValueChange={setAmount} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAmount(balanceCents)}>Full balance</Button>
            <Button size="sm" onClick={() => setAmount(Math.round(balanceCents / 2 / 100) * 100)}>Half</Button>
          </div>
          {method === "cash" ? (
            <Field label="Cash received (optional)" hint={change > 0 ? `Change due: ${fmt(change)}` : undefined}>
              <MoneyInput value={tendered} onValueChange={setTendered} />
            </Field>
          ) : (
            <TextField label="Reference number" value={reference} onChange={(e) => setReference(e.target.value)} hint="Approval code or transaction reference — prevents recording the same payment twice." error={act.fe("reference")} />
          )}
          <TextField label="Note" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <p className="text-[11.5px] text-text-3">Records a payment verified outside the system (cash drawer, card terminal, e-wallet app). No payment gateway is connected.</p>
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const act = useAction(voidPaymentAction);
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm">Void</Button>}
      title="Void this payment?"
      description="Use when a payment was recorded by mistake or bounced. The balance due goes back up."
      requireReason
      confirmLabel="Void payment"
      onConfirm={async (reason) => (await act.run(paymentId, reason)).ok}
    />
  );
}

type RefundLine = { id: string; name: string; quantity: number; refunded: number; lineTotalCents: number; stocked: boolean };

export function RefundDialog({
  saleId,
  lines,
  money,
  netCollectedCents,
  balanceDueCents,
  depositOnly,
}: {
  saleId: string;
  lines: RefundLine[];
  money: Money;
  netCollectedCents: number;
  balanceDueCents: number;
  /** Open order: only money can be returned (no item returns until handover). */
  depositOnly?: boolean;
}) {
  const fmt = (c: number) => formatMoney(c, money.currency, money.locale);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("cash");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey());
  const act = useAction(refundAction, { success: (r) => `Refund ${r.number} recorded`, onSuccess: () => setOpen(false) });
  const est = lines.reduce((s, l) => {
    const q = qty[l.id] ?? 0;
    if (!q) return s;
    return s + Math.round((l.lineTotalCents * (l.refunded + q)) / l.quantity) - Math.round((l.lineTotalCents * l.refunded) / l.quantity);
  }, 0);
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([saleItemId, quantity]) => ({ saleItemId, quantity, restock: restock[saleItemId] ?? true }));
  const amount = custom ?? (items.length ? est : null);
  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQty({});
          setRestock({});
          setCustom(depositOnly ? netCollectedCents : null);
          setMethod("cash");
          setReason(depositOnly ? "Deposit returned" : "");
          setKey(newKey());
          act.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Undo2 /> {depositOnly ? "Refund deposit" : "Refund"}
        </Button>
      </DialogTrigger>
      <DialogContent
        size={depositOnly ? "sm" : "lg"}
        title={depositOnly ? "Refund deposit" : "Refund / return"}
        description={depositOnly ? `${fmt(netCollectedCents)} collected on this order.` : "Choose returned items. Restocked units go back to the shelf and their cost comes out of COGS; damaged units don't."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={act.pending}
              disabled={!amount || !reason.trim()}
              onClick={() => act.run({ saleId, items: depositOnly ? [] : items, amountCents: custom ?? (items.length ? null : amount), method, reason, idempotencyKey: key })}
            >
              Refund {amount ? fmt(amount) : ""}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {!depositOnly ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-[0.06em] text-text-3 uppercase">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Returnable</th>
                  <th className="py-2 text-right">Return qty</th>
                  <th className="py-2 pl-4">Condition</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const remaining = l.quantity - l.refunded;
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="py-2">
                        <span className="font-medium">{l.name}</span>
                        <div className="text-[11.5px] text-text-3">{fmt(l.lineTotalCents)} for {l.quantity}</div>
                      </td>
                      <td className="py-2 text-right tabular">{remaining}</td>
                      <td className="py-2 text-right">
                        <Input type="number" min={0} max={remaining} disabled={!remaining} aria-label={`Return quantity for ${l.name}`} value={qty[l.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [l.id]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))} className="ml-auto h-8 w-20 text-right" />
                      </td>
                      <td className="py-2 pl-4">
                        {l.stocked ? (
                          <Checkbox label="Restock" checked={restock[l.id] ?? true} onChange={(e) => setRestock((r) => ({ ...r, [l.id]: e.target.checked }))} />
                        ) : (
                          <span className="text-[12px] text-text-3">Not stocked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={depositOnly ? "Amount" : "Refund amount"} hint={!depositOnly ? (items.length ? `Calculated from returned items: ${fmt(est)}` : "No items selected — enter an amount for a goodwill refund.") : undefined}>
              <MoneyInput value={amount} onValueChange={setCustom} />
            </Field>
            <SelectField label="Refund method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>Pay back · {PAYMENT_METHOD_LABELS[m]}</option>
              ))}
              {!depositOnly && balanceDueCents > 0 ? <option value="balance_adjustment">Credit to unpaid balance</option> : null}
            </SelectField>
          </div>
          <TextareaField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-[11.5px] text-text-3">Up to {fmt(netCollectedCents)} can be paid back (money collected). Completed transactions are never deleted — a refund record is added.</p>
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function CancelSaleButton({ saleId, label = "Cancel sale" }: { saleId: string; label?: string }) {
  const act = useAction(cancelSaleAction);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger">
          <Ban /> {label}
        </Button>
      }
      title={`${label}?`}
      description="Stock is returned to the shelf and the transaction is marked cancelled (it stays in the history)."
      requireReason
      confirmLabel={label}
      onConfirm={async (reason) => (await act.run(saleId, reason)).ok}
    />
  );
}

const NEXT_LABEL: Partial<Record<FulfillmentStage, string>> = {
  confirmed: "Confirm & reserve stock",
  processing: "Start processing",
  awaiting_lab: "Sent to lab / supplier",
  ready_for_pickup: "Mark ready for pickup",
  completed: "Hand over to customer",
};

export function OrderStageControl({ saleId, allowed, balanceCents, money }: { saleId: string; allowed: FulfillmentStage[]; balanceCents: number; money: Money }) {
  const act = useAction(transitionOrderAction);
  const forward = allowed.filter((s) => s !== "cancelled" && s !== "processing");
  const primary = allowed.includes("completed") ? "completed" : forward[0] ?? (allowed.includes("processing") ? "processing" : null);
  const others = allowed.filter((s) => s !== primary && s !== "cancelled");
  const [confirmHandover, setConfirmHandover] = useState(false);
  if (!allowed.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary ? (
        primary === "completed" && balanceCents > 0 ? (
          <DialogRoot open={confirmHandover} onOpenChange={setConfirmHandover}>
            <DialogTrigger asChild>
              <Button variant="primary">
                {NEXT_LABEL.completed} <ChevronRight />
              </Button>
            </DialogTrigger>
            <DialogContent
              size="sm"
              title="Hand over with a balance due?"
              description={`${formatMoney(balanceCents, money.currency, money.locale)} is still unpaid. Handing over completes the order and the balance becomes a receivable.`}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setConfirmHandover(false)}>Back</Button>
                  <Button variant="primary" loading={act.pending} onClick={async () => { const r = await act.run(saleId, "completed"); if (r.ok) setConfirmHandover(false); }}>
                    Hand over anyway
                  </Button>
                </>
              }
            >
              <p className="text-[13px] text-text-2">Tip: record the payment first if the customer is paying now.</p>
            </DialogContent>
          </DialogRoot>
        ) : (
          <Button variant="primary" loading={act.pending} onClick={() => act.run(saleId, primary)}>
            {NEXT_LABEL[primary] ?? FULFILLMENT_LABELS[primary]} <ChevronRight />
          </Button>
        )
      ) : null}
      {others.length ? (
        <Menu>
          <MenuTrigger asChild>
            <Button>Other stage</Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Move to</MenuLabel>
            {others.map((s) => (
              <MenuItem key={s} onSelect={() => act.run(saleId, s)}>
                {FULFILLMENT_LABELS[s]}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );
}
