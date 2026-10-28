"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/**
 * Modal side panel: traps focus, closes on Escape or the scrim, locks page scroll, and returns focus
 * to whatever opened it.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  onBack,
  progress,
  footer,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "right" | "left";
  onBack?: (() => void) | null;
  progress?: number | null;
  footer?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus], button, a[href], input, select, textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  // Rendered into <body>: an ancestor with position: sticky would otherwise trap it under the header.
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={`drawer${side === "left" ? " drawer--left" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : title}>
        {typeof progress === "number" ? (
          <div className="drawer__progress" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : null}
        <div className="drawer__head">
          {onBack ? (
            <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
              <Icon name="arrowLeft" />
            </button>
          ) : (
            <span />
          )}
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__foot">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
