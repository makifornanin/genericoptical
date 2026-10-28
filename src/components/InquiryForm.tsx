"use client";

import { useState, type FormEvent } from "react";
import type { Branch, InquiryKind, Interest } from "@/lib/api-types";

const INTEREST_LABELS: Record<Interest, string> = {
  eye_exam: "An eye exam",
  prescription_glasses: "Prescription glasses",
  contact_lenses: "Contact lenses",
  sunglasses: "Sunglasses",
  frames: "Frames",
  repair: "A repair or adjustment",
  other: "Something else",
};

type Field = "fullName" | "email" | "phone" | "message" | "preferredBranchId";

/** Contact / product question / appointment request → POST /api/inquiry → a lead in the dashboard. */
export function InquiryForm({
  kind = "contact",
  interest: initialInterest = "other",
  branches,
  productName = null,
  sourcePage,
  submitLabel = "Send message",
  messageLabel = "Message",
  messagePlaceholder,
  initialMessage = "",
  showInterest = true,
  initialBranchId = "",
}: {
  kind?: InquiryKind;
  interest?: Interest;
  branches: Branch[];
  productName?: string | null;
  sourcePage: string;
  submitLabel?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  initialMessage?: string;
  showInterest?: boolean;
  initialBranchId?: string;
}) {
  const [v, setV] = useState({ fullName: "", email: "", phone: "", message: initialMessage, preferredBranchId: initialBranchId, interest: initialInterest, smsConsent: false, website: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Partial<Record<Field, string>> = {};
    if (!v.fullName.trim()) local.fullName = "Please enter your name.";
    if (!v.email.trim() && !v.phone.trim()) local.email = "Please give us an email address or a mobile number.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setStatus("sending");
    setFormError(null);
    try {
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, email: v.email || null, phone: v.phone || null, message: v.message || null, preferredBranchId: v.preferredBranchId || null, kind, productName, sourcePage, marketingConsent: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("sent");
        return;
      }
      setErrors((body.fieldErrors as Partial<Record<Field, string>>) ?? {});
      setFormError(typeof body.error === "string" ? body.error : "We couldn't send your message.");
      setStatus("error");
    } catch {
      setFormError("We couldn't send your message. Please check your connection or call us.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="notice notice--ok" role="status">
        <strong>Thank you — we&apos;ve got your {kind === "appointment_request" ? "request" : "message"}.</strong> {kind === "appointment_request" ? "The branch will call or text you to confirm a time." : "We'll reply by email or text."}
      </div>
    );
  }

  const err = (k: Field) => (errors[k] ? <span className="error">{errors[k]}</span> : null);
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      {formError ? (
        <p className="notice notice--error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="form-grid form-grid--2">
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="iq-name">Full name</label>
          <input id="iq-name" className="input" autoComplete="name" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} aria-invalid={Boolean(errors.fullName)} />
          {err("fullName")}
        </div>
        <div className="field">
          <label htmlFor="iq-email">Email</label>
          <input id="iq-email" className="input" type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} aria-invalid={Boolean(errors.email)} />
          {err("email")}
        </div>
        <div className="field">
          <label htmlFor="iq-phone">Mobile number</label>
          <input id="iq-phone" className="input" type="tel" autoComplete="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-invalid={Boolean(errors.phone)} />
          {err("phone")}
        </div>
        {showInterest ? (
          <div className="field">
            <label htmlFor="iq-interest">I&apos;m asking about</label>
            <select id="iq-interest" className="select" value={v.interest} onChange={(e) => setV({ ...v, interest: e.target.value as Interest })}>
              {(Object.keys(INTEREST_LABELS) as Interest[]).map((k) => (
                <option key={k} value={k}>
                  {INTEREST_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="iq-branch">Branch</label>
          <select id="iq-branch" className="select" value={v.preferredBranchId} onChange={(e) => setV({ ...v, preferredBranchId: e.target.value })}>
            <option value="">Any branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {err("preferredBranchId")}
        </div>
      </div>
      <div className="field">
        <label htmlFor="iq-message">{messageLabel}</label>
        <textarea id="iq-message" className="textarea" maxLength={2000} placeholder={messagePlaceholder} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
        {err("message")}
      </div>
      <label className="check">
        <input type="checkbox" checked={v.smsConsent} onChange={(e) => setV({ ...v, smsConsent: e.target.checked })} />
        <span>You may text me about this {kind === "appointment_request" ? "appointment" : "message"}.</span>
      </label>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="iq-website">Website</label>
        <input id="iq-website" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
      </div>
      <button type="submit" className="btn btn--primary" disabled={status === "sending"} style={{ justifySelf: "start" }}>
        {status === "sending" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
