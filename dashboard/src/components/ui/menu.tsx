"use client";

import { DropdownMenu as M, Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-[200px] rounded-[12px] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, destructive, disabled }: { children: ReactNode; onSelect?: (e: Event) => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-[13px] outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-muted-soft [&_svg]:size-4 [&_svg]:text-text-3",
        destructive && "text-neg [&_svg]:text-neg",
      )}
    >
      {children}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-[0.06em] text-text-3 uppercase">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content side={side} sideOffset={6} className="z-50 max-w-[260px] rounded-[8px] bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-[var(--shadow-pop)]">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
