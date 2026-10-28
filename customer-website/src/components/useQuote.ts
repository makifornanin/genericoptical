"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/api-types";
import { cartItems, type BagLine } from "@/lib/bag";

type Result = { key: string; quote: Quote | null; error: string | null };

/** Live price and branch availability for the bag, from the dashboard (via /api/cart/quote). */
export function useQuote(lines: BagLine[], ready: boolean) {
  const [result, setResult] = useState<Result | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${JSON.stringify(cartItems(lines))}#${version}`;
  const active = ready && lines.length > 0;

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems(lines) }), signal: ctrl.signal });
        const body = await res.json().catch(() => ({}));
        if (res.ok) setResult({ key, quote: body as Quote, error: null });
        else setResult({ key, quote: null, error: typeof body.error === "string" ? body.error : "We couldn't check prices right now." });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResult({ key, quote: null, error: "We couldn't check prices right now. Please check your connection." });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `key` captures the lines that matter for pricing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  // A result only counts for the bag it was computed for.
  const current = active && result?.key === key ? result : null;
  return {
    quote: current?.quote ?? null,
    error: current?.error ?? null,
    loading: active && !current,
    refresh: () => setVersion((v) => v + 1),
  };
}
