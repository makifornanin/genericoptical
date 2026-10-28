"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";

const noSubscribe = () => () => {};
function readLastOrder(): string | null {
  try {
    return window.localStorage.getItem("lensmere.lastOrder");
  } catch {
    return null;
  }
}

/** Find an order by number + email; also offers the last order placed in this browser. */
export function OrderLookup() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const raw = useSyncExternalStore(noSubscribe, readLastOrder, () => null);
  const last = useMemo(() => {
    try {
      const parsed = raw ? (JSON.parse(raw) as { number?: unknown; token?: unknown }) : null;
      return parsed && typeof parsed.number === "string" && typeof parsed.token === "string" ? { number: parsed.number, token: parsed.token } : null;
    } catch {
      return null;
    }
  }, [raw]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number, email }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.href === "string") router.push(body.href);
      else setError(typeof body.error === "string" ? body.error : "We couldn't find that order.");
    } catch {
      setError("We couldn't reach the shop. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 28, maxWidth: 560 }}>
      {last ? (
        <p className="notice">
          Your last order from this browser: <a className="link" href={`/order/${last.number}?t=${encodeURIComponent(last.token)}`}>{last.number}</a>
        </p>
      ) : null}
      <form onSubmit={submit} className="form-grid" noValidate>
        <div className="field">
          <label htmlFor="lk-number">Order number</label>
          <input id="lk-number" className="input" placeholder="ORD-000123" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="lk-email">Email used at checkout</label>
          <input id="lk-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={busy} style={{ justifySelf: "start" }}>
          {busy ? "Looking…" : "Find my order"}
        </button>
      </form>
    </div>
  );
}
