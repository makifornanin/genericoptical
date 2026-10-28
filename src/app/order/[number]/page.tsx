import type { Metadata } from "next";
import Link from "next/link";
import { OrderActions } from "@/components/OrderActions";
import { getSite } from "@/lib/api";
import type { OrderView } from "@/lib/api-types";
import { dateTime, groupedHours, money, shortDay, telHref } from "@/lib/format";
import { rxModeLabel } from "@/lib/lens";
import { getOrder } from "@/lib/orders-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const STEPS = [
  { key: "placed", title: "Order placed" },
  { key: "confirmed", title: "Confirmed" },
  { key: "processing", title: "Being prepared" },
  { key: "ready_for_pickup", title: "Ready to collect" },
  { key: "completed", title: "Collected" },
] as const;

function stepIndex(o: OrderView): number {
  if (o.stage === "completed") return 4;
  if (o.stage === "ready_for_pickup") return 3;
  if (o.stage === "processing" || o.stage === "awaiting_lab") return 2;
  if (o.stage === "confirmed") return 1;
  return 0;
}

function headline(o: OrderView, placed: boolean): { title: string; body: string } {
  const first = o.contact.name.split(/\s+/)[0];
  if (o.status === "cancelled") return { title: `Order ${o.number} is cancelled`, body: o.cancelledByCustomer ? "You cancelled this order. The items went back on sale." : "This order was cancelled by the branch. Contact them if you have questions." };
  if (o.stage === "completed") return { title: "Collected — enjoy your new pair", body: `Order ${o.number} was handed over at ${o.branch.name}. Bring your glasses back any time for adjustments.` };
  if (o.stage === "ready_for_pickup") return { title: `${first}, your order is ready`, body: `Collect it at ${o.branch.name}${o.balanceDueCents ? ` and pay ${money(o.balanceDueCents, { currency: o.currency, locale: "en-PH" })} there` : ""}. We'll check the fit before you go.` };
  if (placed) return { title: `Thank you, ${first}. Your order is in.`, body: `We've set your items aside at ${o.branch.name}. We'll contact you when it's ready to collect.` };
  return { title: `Order ${o.number}`, body: `For pickup at ${o.branch.name}. This page always shows the latest status.` };
}

export default async function OrderPage(props: PageProps<"/order/[number]">) {
  const [{ number }, search] = await Promise.all([props.params, props.searchParams]);
  const token = typeof search.t === "string" ? search.t : "";
  const placed = search.placed === "1";
  const [res, site] = await Promise.all([getOrder(number, token), getSite()]);
  if (!res.ok) {
    return (
      <div className="wrap empty">
        <h2>{res.status === 404 ? "We couldn't find that order" : "We couldn't load your order"}</h2>
        <p>{res.status === 404 ? "Check the link from your confirmation, or look it up with your order number and email." : res.error}</p>
        <p style={{ marginTop: 20 }}>
          <Link href="/order" className="btn btn--primary">
            Find my order
          </Link>
        </p>
      </div>
    );
  }
  const o = res.data.order;
  const fmt = { currency: o.currency, locale: site.ok ? site.data.business.locale : "en-PH" };
  const tz = site.ok ? site.data.business.timezone : "Asia/Manila";
  const current = stepIndex(o);
  // Only orders with prescription lenses go to a lab; everything else is just set aside and checked.
  const detail = (key: string) => (key === "confirmed" ? "Items set aside" : key === "processing" ? (o.prescriptions.length > 0 ? "Lenses at the lab" : "Checked and packed") : "");
  const at = (key: string) => o.timeline.find((t) => t.stage === key || (key === "processing" && t.stage === "awaiting_lab"))?.at;
  const head = headline(o, placed);
  const cancelled = o.status === "cancelled";
  const shopEmail = site.ok ? site.data.business.email : null;

  return (
    <div className="wrap">
      <header className="order-head">
        <p className="eyebrow">
          Order {o.number} · placed {dateTime(o.placedAt, tz, fmt.locale)}
        </p>
        <h1>{head.title}</h1>
        <p>{head.body}</p>
      </header>

      {!cancelled ? (
        <ol className="tracker" style={{ ["--steps" as string]: STEPS.length, marginBottom: 48 }} aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < current ? "is-done" : i === current ? "is-current" : undefined} aria-current={i === current ? "step" : undefined}>
              <strong>{s.title}</strong>
              <span>{at(s.key) ? dateTime(at(s.key)!, tz, fmt.locale) : i === 3 && o.readyBy && current < 3 ? `Aim: ${shortDay(o.readyBy, fmt.locale)}` : i >= current ? detail(s.key) : ""}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="order-grid">
        <div>
          <section className="order-panel" aria-labelledby="o-items">
            <h2 id="o-items">Items</h2>
            <dl className="review">
              {o.items.map((it, i) => (
                <div key={i}>
                  <dt>
                    {it.quantity > 1 ? `${it.quantity} × ` : ""}
                    {it.name}
                    {it.variantLabel && it.variantLabel !== "Default" && it.variantLabel !== "Pair" ? <span className="muted"> · {it.variantLabel}</span> : null}
                  </dt>
                  <dd>{money(it.lineTotalCents, fmt)}</dd>
                </div>
              ))}
              <div>
                <dt>Collection in branch</dt>
                <dd>Free</dd>
              </div>
              <div style={{ fontWeight: 500, fontSize: 17 }}>
                <dt style={{ color: "var(--ink)" }}>Total</dt>
                <dd>{money(o.totalCents, fmt)}</dd>
              </div>
            </dl>
          </section>

          {o.prescriptions.length ? (
            <section className="order-panel" aria-labelledby="o-rx">
              <h2 id="o-rx">Prescription</h2>
              <ul style={{ display: "grid", gap: 14 }}>
                {o.prescriptions.map((rx, i) => (
                  <li key={i}>
                    <strong style={{ fontWeight: 500 }}>{rx.frame}</strong>
                    <p className="muted">
                      {rx.lens} · {rxModeLabel(rx.mode)}
                    </p>
                    <p style={{ marginTop: 4, fontSize: 15, color: "var(--ink-2)" }}>
                      {rx.mode === "enter"
                        ? "Our optometrist will check the values you entered before your lenses are ordered."
                        : rx.mode === "send_later"
                          ? `${shopEmail ? `Email a photo of it to ${shopEmail}` : "Send us a photo of it"} with your order number, or bring it to ${o.branch.name}.`
                          : rx.mode === "on_file"
                            ? "We'll use your latest prescription from an eye exam with us, and contact you if it's out of date."
                            : `Book your eye exam at ${o.branch.name}; your lenses are made after it.`}
                    </p>
                    {rx.mode === "book_exam" ? (
                      <Link href="/eye-exam" className="arrow-link" style={{ marginTop: 8 }}>
                        Book an eye exam
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="order-panel" aria-labelledby="o-pay">
            <h2 id="o-pay">Payment</h2>
            {cancelled ? (
              <p>Nothing to pay: this order is cancelled.</p>
            ) : o.paymentOption === "demo_card" && o.paidCents > 0 ? (
              <p>
                Paid {money(o.paidCents, fmt)} online with the demo card. <span className="muted">This is a demonstration store: nothing was charged.</span>
              </p>
            ) : (
              <p>
                To pay at pickup: <strong className="num">{money(o.balanceDueCents, fmt)}</strong>. Pay in branch by card, cash, GCash or Maya.
              </p>
            )}
          </section>
        </div>

        <aside>
          <section className="order-panel" aria-labelledby="o-branch">
            <h2 id="o-branch">Pickup at {o.branch.name}</h2>
            <address style={{ fontStyle: "normal", color: "var(--ink-2)" }}>
              {o.branch.address.map((l) => (
                <span key={l} style={{ display: "block" }}>
                  {l}
                </span>
              ))}
            </address>
            {o.branch.hours ? (
              <dl className="hours" style={{ marginTop: 14 }}>
                {groupedHours(o.branch.hours).map((h) => (
                  <div key={h.days} style={{ display: "contents" }}>
                    <dt>{h.days}</dt>
                    <dd>{h.time}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
              {o.branch.phone ? (
                <a href={telHref(o.branch.phone)} className="arrow-link">
                  {o.branch.phone}
                </a>
              ) : null}
              <a href={o.branch.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.branch.address.join(", "))}`} className="arrow-link" target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            </div>
          </section>
          <section className="order-panel" aria-label="Order link">
            <p className="muted" style={{ fontSize: 14.5, marginBottom: 14 }}>
              Keep this page&apos;s link: it&apos;s how you check your order. You can also find it with your order number and {o.contact.email ? "email" : "details"}.
            </p>
            <OrderActions number={o.number} token={token} canCancel={o.canCancel} />
          </section>
        </aside>
      </div>
    </div>
  );
}
