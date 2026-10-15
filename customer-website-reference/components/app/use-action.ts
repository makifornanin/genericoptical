"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

/**
 * Calls a Server Action, tracks pending state and field errors, and shows a toast.
 * Actions refresh the route themselves on success, so server data re-renders automatically.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; silent?: boolean } = {},
) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  const run = useCallback(
    (...args: A) =>
      new Promise<ActionResult<T>>((resolve) => {
        start(async () => {
          let result: ActionResult<T>;
          try {
            result = await action(...args);
          } catch {
            result = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
          }
          if (result.ok) {
            setError(null);
            setFieldErrors({});
            const msg = result.message ?? (typeof opts.success === "function" ? opts.success(result.data) : opts.success);
            if (msg && !opts.silent) toast.success(msg);
            opts.onSuccess?.(result.data);
          } else {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            if (!opts.silent) toast.error(result.error);
          }
          resolve(result);
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  );

  const fe = (key: string) => fieldErrors[key]?.[0];
  return { run, pending, error, fieldErrors, fe, reset: () => (setError(null), setFieldErrors({})) };
}

export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
