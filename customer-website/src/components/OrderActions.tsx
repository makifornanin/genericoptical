"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Copy the order link, and cancel an unpaid order before work starts. */
export function OrderActions({ number, token, canCancel }: { number: string; token: string; canCancel: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    const url = `${window.location.origin}/order/${number}?t=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy your order link:", url);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${number}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "We couldn't cancel this order.");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
      <button type="button" className="btn btn--secondary btn--small" onClick={copy}>
        {copied ? "Link copied" : "Copy order link"}
      </button>
      {canCancel ? (
        confirming ? (
          <div className="notice" role="alertdialog" aria-labelledby="cancel-q" style={{ display: "grid", gap: 12, width: "100%" }}>
            <p id="cancel-q">
              <strong>Cancel this order?</strong> The items go back on sale and you won&apos;t be able to undo this.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn--primary btn--small" onClick={cancel} disabled={busy}>
                {busy ? "Cancelling…" : "Yes, cancel order"}
              </button>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirming(false)} disabled={busy}>
                Keep order
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="text-btn" onClick={() => setConfirming(true)}>
            Cancel order
          </button>
        )
      ) : null}
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
