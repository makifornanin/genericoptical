"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Branch, PaymentOption } from "@/lib/api-types";
import { lineTotal, newLineId } from "@/lib/bag";
import { checkDemoCard, formatCardNumber, formatExpiry, TEST_CARDS } from "@/lib/demo-card";
import { groupedHours, money, type MoneyFormat } from "@/lib/format";
import { rxModeLabel, rxProblems } from "@/lib/lens";
import { productImage } from "@/lib/media";
import { useBag } from "./BagProvider";
import { Picture } from "./Picture";
import { useQuote } from "./useQuote";

type Errors = Partial<Record<"fullName" | "email" | "phone" | "branch" | "contactRx" | "number" | "expiry" | "cvc" | "form", string>>;

export function CheckoutForm({ fmt, branches, demoPayments, businessName }: { fmt: MoneyFormat; branches: Branch[]; demoPayments: boolean; businessName: string }) {
  const router = useRouter();
  const { lines, ready, clear } = useBag();
  const { quote, error: quoteError, refresh } = useQuote(lines, ready);
  const idempotencyKey = useRef(newLineId());
  const [contact, setContact] = useState({ fullName: "", email: "", phone: "" });
  const [chosenBranch, setBranchId] = useState<string>("");
  const [payment, setPayment] = useState<PaymentOption>(demoPayments ? "demo_card" : "pay_at_pickup");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });
  const [contactRx, setContactRx] = useState(false);
  const [note, setNote] = useState("");
  const [sms, setSms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const errorBox = useRef<HTMLDivElement>(null);
  // Set once the order is placed, so emptying the bag doesn't bounce us back to /bag.
  const [placed, setPlaced] = useState(false);

  const hasContacts = lines.some((l) => l.categoryKind === "contact_lenses");
  const hasLenses = lines.some((l) => l.lens);
  const fulfil = new Map(quote?.branches.map((b) => [b.branchId, b]) ?? []);
  const total = quote?.totalCents ?? lines.reduce((n, l) => n + lineTotal(l), 0);

  // The chosen branch while it can fulfil the bag; otherwise the first branch that can.
  const branchId = fulfil.get(chosenBranch)?.canFulfil ? chosenBranch : (quote?.branches.find((b) => b.canFulfil)?.branchId ?? "");

  useEffect(() => {
    if (ready && !lines.length && !submitting && !placed) router.replace("/bag");
  }, [ready, lines.length, router, submitting, placed]);

  if (!ready || !lines.length) return <div className="empty" aria-busy="true">{placed ? "Opening your order…" : null}</div>;

  function validate(): Errors {
    const e: Errors = {};
    if (!contact.fullName.trim()) e.fullName = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) e.email = "Enter a valid email address.";
    if (contact.phone.replace(/\D/g, "").length < 7) e.phone = "Enter a mobile number so the branch can reach you.";
    if (!branchId) e.branch = "Choose a branch to collect from.";
    if (hasContacts && !contactRx) e.contactRx = "Please confirm you have a current contact lens prescription.";
    for (const l of lines) {
      const problems = rxProblems(l.prescription, l.lens?.type !== "single_vision");
      if (problems.length) e.form = `${l.name}: ${problems[0]} Remove it from your bag and add it again with the corrected prescription.`;
    }
    if (payment === "demo_card") {
      const check = checkDemoCard(card);
      if (!check.ok) e[check.field] = check.message;
    }
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true'], .notice--error")?.focus?.());
      return;
    }
    const check = payment === "demo_card" ? checkDemoCard(card) : null;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          branchId,
          customer: { fullName: contact.fullName.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, lensVariantId: l.lens?.variantId ?? null, prescription: l.lens ? (l.prescription ?? { mode: "send_later" }) : null })),
          payment: check && check.ok ? { option: "demo_card", cardBrand: check.brand, cardLast4: check.last4 } : { option: "pay_at_pickup" },
          expectedTotalCents: total,
          contactLensRxConfirmed: contactRx,
          note: note.trim() || null,
          marketingConsent: marketing,
          smsConsent: sms,
          website: "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.number && body.token) {
        try {
          window.localStorage.setItem("lensmere.lastOrder", JSON.stringify({ number: body.number, token: body.token }));
        } catch {
          /* ignore */
        }
        setPlaced(true);
        router.push(`/order/${body.number}?t=${encodeURIComponent(body.token)}&placed=1`);
        clear();
        return;
      }
      const fieldErrors = body.fieldErrors as Record<string, string[]> | undefined;
      const mapped: Errors = {};
      if (fieldErrors) {
        for (const [path, messages] of Object.entries(fieldErrors)) {
          if (path === "customer.fullName") mapped.fullName = messages[0];
          else if (path === "customer.email") mapped.email = messages[0];
          else if (path === "customer.phone") mapped.phone = messages[0];
          else if (path === "contactLensRxConfirmed") mapped.contactRx = messages[0];
          else mapped.form = messages[0];
        }
      }
      if (res.status === 409) refresh();
      setErrors({ ...mapped, form: mapped.form ?? (typeof body.error === "string" ? body.error : "We couldn't place your order. Please try again.") });
      requestAnimationFrame(() => errorBox.current?.focus());
    } catch {
      setErrors({ form: "We couldn't reach the shop. Check your connection and try again — you won't be charged twice." });
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (k: keyof Errors) =>
    errors[k] ? (
      <span className="error" id={`err-${k}`}>
        {errors[k]}
      </span>
    ) : null;

  return (
    <form className="checkout" onSubmit={submit} noValidate>
      <div>
        {errors.form ? (
          <div className="notice notice--error" role="alert" tabIndex={-1} ref={errorBox} style={{ marginBottom: 20 }}>
            {errors.form}
          </div>
        ) : null}

        <section className="checkout-step" aria-labelledby="step-contact">
          <h2 id="step-contact">
            <span>1</span> Your details
          </h2>
          <div className="form-grid form-grid--2">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="co-name">Full name</label>
              <input id="co-name" className="input" autoComplete="name" value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "err-fullName" : undefined} />
              {fieldError("fullName")}
            </div>
            <div className="field">
              <label htmlFor="co-email">Email</label>
              <input id="co-email" className="input" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "err-email" : "hint-email"} />
              {fieldError("email") ?? (
                <span className="hint" id="hint-email">
                  For your order confirmation link
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="co-phone">Mobile number</label>
              <input id="co-phone" className="input" type="tel" autoComplete="tel" placeholder="0917 123 4567" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "err-phone" : "hint-phone"} />
              {fieldError("phone") ?? (
                <span className="hint" id="hint-phone">
                  The branch contacts you when it&apos;s ready
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="checkout-step" aria-labelledby="step-branch">
          <h2 id="step-branch">
            <span>2</span> Pickup branch
          </h2>
          {quoteError ? <p className="notice notice--error">{quoteError}</p> : null}
          <div className="options" role="radiogroup" aria-labelledby="step-branch" aria-invalid={Boolean(errors.branch)}>
            {branches.map((b) => {
              const f = fulfil.get(b.id);
              const can = f?.canFulfil ?? false;
              const short = f && !can ? lines.filter((l) => f.unavailableVariantIds.includes(l.variantId)).map((l) => l.name) : [];
              return (
                <label key={b.id} className={`option${branchId === b.id ? " is-selected" : ""}${!can ? " is-disabled" : ""}`}>
                  <input type="radio" name="branch" value={b.id} checked={branchId === b.id} disabled={!can} onChange={() => setBranchId(b.id)} />
                  <span className="option__head">
                    <span>{b.name}</span>
                    <span className="option__price" style={{ fontWeight: 400, fontSize: 14 }}>
                      {!quote ? "Checking…" : can ? (hasLenses ? "Ready in about a week" : "Ready in 1–2 days") : "Not available"}
                    </span>
                  </span>
                  <span className="option__body" style={{ display: "block" }}>
                    {b.address.join(", ")}
                    <br />
                    {groupedHours(b.hours)
                      .map((h) => `${h.days} ${h.time}`)
                      .join(" · ")}
                    {short.length ? (
                      <>
                        <br />
                        Not in stock here: {short.join(", ")}
                      </>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {fieldError("branch")}
        </section>

        {hasContacts ? (
          <section className="checkout-step" aria-labelledby="step-rx">
            <h2 id="step-rx">
              <span>3</span> Contact lens prescription
            </h2>
            <label className="check">
              <input type="checkbox" checked={contactRx} onChange={(e) => setContactRx(e.target.checked)} aria-invalid={Boolean(errors.contactRx)} />
              <span>I have a current contact lens prescription for the lenses I&apos;m ordering. The branch may ask to see it at pickup.</span>
            </label>
            {fieldError("contactRx")}
          </section>
        ) : null}

        <section className="checkout-step" aria-labelledby="step-pay">
          <h2 id="step-pay">
            <span>{hasContacts ? 4 : 3}</span> Payment
          </h2>
          <div className="options" role="radiogroup" aria-labelledby="step-pay">
            {demoPayments ? (
              <label className={`option${payment === "demo_card" ? " is-selected" : ""}`}>
                <input type="radio" name="payment" checked={payment === "demo_card"} onChange={() => setPayment("demo_card")} />
                <span className="option__head">
                  <span>Pay online by card</span>
                  <span className="option__price" style={{ fontWeight: 400, fontSize: 14 }}>
                    Demo — not charged
                  </span>
                </span>
                <span className="option__body" style={{ display: "block" }}>
                  A simulated card step: no money moves and real cards are refused.
                </span>
              </label>
            ) : null}
            <label className={`option${payment === "pay_at_pickup" ? " is-selected" : ""}`}>
              <input type="radio" name="payment" checked={payment === "pay_at_pickup"} onChange={() => setPayment("pay_at_pickup")} />
              <span className="option__head">
                <span>Pay at pickup</span>
              </span>
              <span className="option__body" style={{ display: "block" }}>
                Pay in branch when you collect.
              </span>
            </label>
          </div>
          {payment === "demo_card" ? (
            <div className="summary" style={{ marginTop: 14 }}>
              <p className="test-cards">
                Use the test card <code>{TEST_CARDS[0].number}</code>, any future expiry date and any three-digit code. <code>{TEST_CARDS[2].number}</code> shows a declined payment. Card details stay in your browser.
              </p>
              <div className="form-grid form-grid--2">
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="cc-number">Card number</label>
                  <input id="cc-number" className="input" inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} aria-invalid={Boolean(errors.number)} aria-describedby={errors.number ? "err-number" : undefined} />
                  {fieldError("number")}
                </div>
                <div className="field">
                  <label htmlFor="cc-exp">Expiry</label>
                  <input id="cc-exp" className="input" inputMode="numeric" autoComplete="off" placeholder="MM / YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} aria-invalid={Boolean(errors.expiry)} aria-describedby={errors.expiry ? "err-expiry" : undefined} />
                  {fieldError("expiry")}
                </div>
                <div className="field">
                  <label htmlFor="cc-cvc">Security code</label>
                  <input id="cc-cvc" className="input" inputMode="numeric" autoComplete="off" placeholder="123" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })} aria-invalid={Boolean(errors.cvc)} aria-describedby={errors.cvc ? "err-cvc" : undefined} />
                  {fieldError("cvc")}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="checkout-step" aria-labelledby="step-final">
          <h2 id="step-final">
            <span>{hasContacts ? 5 : 4}</span> Anything else?
          </h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="co-note">Note for the branch (optional)</label>
              <textarea id="co-note" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 90 }} />
            </div>
            <label className="check">
              <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
              <span>Text me about this order (ready for pickup, questions about my prescription).</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>Send me news and offers from {businessName} occasionally.</span>
            </label>
          </div>
          <button type="submit" className="btn btn--primary btn--block" style={{ marginTop: 24 }} disabled={submitting || !quote || Boolean(quoteError)}>
            {submitting ? <span className="spinner" aria-hidden="true" /> : null}
            {submitting ? "Placing your order…" : `Place order · ${money(total, fmt)}`}
          </button>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>
            By placing your order you agree to our <Link href="/terms" className="link">terms</Link> and <Link href="/privacy" className="link">privacy notice</Link>.
          </p>
        </section>
      </div>

      <aside className="summary" aria-labelledby="co-summary" style={{ position: "sticky", top: "calc(var(--header-h) + 24px)" }}>
        <h2 id="co-summary">Your order</h2>
        <ul className="mini-lines">
          {lines.map((l) => (
            <li key={l.id} className="mini-line">
              <div className="mini-line__media">
                <Picture image={productImage(l.slug, l.colourKey, "front")} alt="" sizes="72px" />
              </div>
              <div>
                <strong>
                  {l.quantity > 1 ? `${l.quantity} × ` : ""}
                  {l.name}
                </strong>
                <span className="muted" style={{ display: "block" }}>
                  {l.eye ? `${l.eye === "right" ? "Right" : "Left"} eye · ` : ""}
                  {l.variantLabel === "Default" ? "" : l.variantLabel}
                  {l.lens ? ` · ${l.lens.title}` : ""}
                </span>
                {l.prescription ? <span className="muted" style={{ display: "block" }}>Prescription: {rxModeLabel(l.prescription.mode)}</span> : null}
              </div>
              <span className="num">{money(lineTotal(l), fmt)}</span>
            </li>
          ))}
        </ul>
        <dl>
          <div>
            <dt>Collection in branch</dt>
            <dd>Free</dd>
          </div>
          {quote?.pricesIncludeTax && quote.taxCents ? (
            <div className="muted" style={{ fontSize: 13.5 }}>
              <dt>Includes VAT</dt>
              <dd>{money(quote.taxCents, fmt)}</dd>
            </div>
          ) : null}
          <div className="total">
            <dt>Total</dt>
            <dd>{money(total, fmt)}</dd>
          </div>
        </dl>
        <Link href="/bag" className="text-btn">
          Edit bag
        </Link>
      </aside>
    </form>
  );
}
