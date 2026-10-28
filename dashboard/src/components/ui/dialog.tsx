"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const DialogRoot = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = "md",
  side,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Render as a right-side panel instead of a centred dialog. */
  side?: boolean;
}) {
  const width = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[980px]" }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border border-line bg-surface shadow-[var(--shadow-pop)] focus:outline-none",
          side
            ? "inset-y-0 right-0 h-full w-full max-w-[520px] border-y-0 border-r-0"
            : cn("top-1/2 left-1/2 max-h-[min(88vh,900px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px]", width),
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[16px] font-semibold tracking-[-0.01em]">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-text-2">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
          </div>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </D.Close>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div> : null}
      </D.Content>
    </D.Portal>
  );
}

/** Confirmation dialog for destructive or irreversible actions, with an optional reason field. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  requireReason,
  reasonLabel = "Reason",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReason(""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={busy}
              disabled={requireReason && !reason.trim()}
              onClick={async () => {
                setBusy(true);
                const ok = await onConfirm(reason.trim());
                setBusy(false);
                if (ok !== false) setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {requireReason ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] font-medium text-text-2" htmlFor="confirm-reason">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-reason"
              className="min-h-[72px] w-full rounded-[10px] border border-line-strong px-3 py-2 text-[13.5px] focus:border-ink focus:outline-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <p className="text-[13.5px] text-text-2">This action is recorded in the activity log.</p>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
