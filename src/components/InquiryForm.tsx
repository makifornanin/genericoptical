"use client";

import "@/styles/forms.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { InquiryKind, Interest } from "@/lib/api-types";
import { telHref } from "@/lib/format";
import { INTEREST_OPTIONS, REPLY_TIME } from "@/lib/site-settings";
import { Icon } from "./Icon";

/*
 * Website inquiry form (contact, product inquiry, appointment request). Posts JSON to this site's
 * own POST /api/inquiry, which validates it again and forwards it server-to-server to the
 * dashboard (where it becomes a lead, then a GoHighLevel contact). Nothing secret is in the browser.
 */

type Field = "fullName" | "email" | "phone" | "interest" | "preferredBranchId" | "message";
const FIELD_ORDER: Field[] = ["fullName", "email", "phone", "interest", "preferredBranchId", "message"];
type Errors = Partial<Record<Field, string>>;

interface Props {
  kind: InquiryKind;
  branches: { id: string; name: string }[];
  defaultInterest?: Interest;
  defaultBranchId?: string | null;
  /** Prefilled message; follows the parent (e.g. the chosen variant) until the visitor edits it. */
  defaultMessage?: string;
  /** Sent as productName (product inquiries): "Name (variant)". */
  productName?: string | null;
  /** Added before the visitor's message on submit (appointment requests: service and branch). */
  messagePrefix?: string | null;
  phone?: string | null;
  submitLabel?: string;
  /** Accessible name of the form. */
  title: string;
  /** Wrap in the white form card (false inside an existing card). */
  card?: boolean;
}

interface Edits {
  fullName: string;
  email: string;
  phone: string;
  interest?: Interest;
  preferredBranchId?: string;
  message?: string;
  smsConsent: boolean;
  marketingConsent: boolean;
  website: string;
}
const EMPTY: Edits = { fullName: "", email: "", phone: "", smsConsent: false, marketingConsent: false, website: "" };

function validate(v: { fullName: string; email: string; phone: string; message: string }): Errors {
  const errors: Errors = {};
  const name = v.fullName.trim();
  if (!name) errors.fullName = "Please enter your name.";
  else if (name.length > 120) errors.fullName = "Please keep your name under 120 characters.";
  const email = v.email.trim();
  const phone = v.phone.trim();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.email = "Please enter a valid email address.";
  if (phone && phone.replace(/\D/g, "").length < 7) errors.phone = "Please enter a mobile number with at least 7 digits.";
  if (!email && !phone) errors.email = "Please give us an email address or a mobile number.";
  if (v.message.length > 2000) errors.message = "Please keep your message under 2,000 characters.";
  return errors;
}

export function InquiryForm({
  kind,
  branches,
  defaultInterest = "other",
  defaultBranchId = null,
  defaultMessage = "",
  productName = null,
  messagePrefix = null,
  phone = null,
  submitLabel = "Send message",
  title,
  card = true,
}: Props) {
  const id = useId();
  const pathname = usePathname();
  const [edits, setEdits] = useState<Edits>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "pending" | "sent">("idle");
  const [alert, setAlert] = useState<string | null>(null);
  const [sentName, setSentName] = useState("");
  const doneRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const interest = edits.interest ?? defaultInterest;
  const branchId = edits.preferredBranchId ?? (defaultBranchId && branches.some((b) => b.id === defaultBranchId) ? defaultBranchId : "");
  const message = edits.message ?? defaultMessage;
  const fid = (f: string) => `${id}-${f}`;

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

  function set<K extends keyof Edits>(key: K, value: Edits[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusFirst(errs: Errors) {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fid(first))}`)?.focus();
  }

  const callUs = phone ? (
    <>
      {" "}
      on{" "}
      <a href={telHref(phone)}>{phone}</a>
    </>
  ) : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending") return;
    setAlert(null);
    const found = validate({ fullName: edits.fullName, email: edits.email, phone: edits.phone, message });
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirst(found);
      return;
    }
    const text = message.trim();
    const payload = {
      fullName: edits.fullName.trim(),
      email: edits.email.trim() || null,
      phone: edits.phone.trim() || null,
      interest,
      preferredBranchId: branchId || null,
      message: messagePrefix ? [messagePrefix, text].filter(Boolean).join("\n\n") : text || null,
      smsConsent: edits.smsConsent,
      marketingConsent: edits.marketingConsent,
      kind,
      productName: productName || null,
      sourcePage: pathname || "/",
      website: edits.website,
    };
    setStatus("pending");
    let res: Response;
    try {
      res = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch {
      setStatus("idle");
      setAlert("network");
      return;
    }
    if (res.status === 201) {
      setSentName(payload.fullName.split(/\s+/)[0] ?? "");
      setStatus("sent");
      return;
    }
    const data = (await res.json().catch(() => null)) as { code?: string; fieldErrors?: Record<string, string> } | null;
    setStatus("idle");
    if (res.status === 400 && data?.fieldErrors) {
      const fieldErrors: Errors = {};
      for (const f of FIELD_ORDER) if (data.fieldErrors[f]) fieldErrors[f] = data.fieldErrors[f];
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors);
        setAlert("invalid");
        focusFirst(fieldErrors);
        return;
      }
    }
    setAlert(res.status === 429 ? "rate_limited" : res.status === 413 ? "too_large" : "unavailable");
  }

  function reset() {
    setEdits(EMPTY);
    setErrors({});
    setAlert(null);
    setStatus("idle");
  }

  const describedBy = (f: Field, hint?: string) => [hint, errors[f] ? fid(`${f}-error`) : null].filter(Boolean).join(" ") || undefined;
  const error = (f: Field) =>
    errors[f] ? (
      <p className="oc-form-error" id={fid(`${f}-error`)}>
        {errors[f]}
      </p>
    ) : null;

  let body;
  if (status === "sent") {
    body = (
      <div className="oc-form-done" role="status" tabIndex={-1} ref={doneRef} data-inquiry-sent>
        <div className="oc-confirm__icon">
          <Icon name="check" />
        </div>
        <p className="oc-form-done__title">Thanks{sentName ? `, ${sentName}` : ""}.</p>
        <p className="oc-form-done__body">
          {kind === "appointment_request" ? (
            <>We&apos;ve received your request. We&apos;ll call you to confirm a time — your appointment isn&apos;t booked until we do.</>
          ) : (
            <>
              We&apos;ve received your message and will reply {REPLY_TIME}.
              {phone ? (
                <>
                  {" "}
                  If it&apos;s urgent, call us on{" "}
                  <a className="oc-text-link" href={telHref(phone)}>
                    {phone}
                  </a>
                  .
                </>
              ) : null}
            </>
          )}
        </p>
        <button type="button" className="oc-text-link" onClick={reset}>
          Send another message
        </button>
      </div>
    );
  } else {
    body = (
      <form ref={formRef} className="oc-form" onSubmit={onSubmit} noValidate aria-label={title} aria-busy={status === "pending"}>
        {alert ? (
          <p className="oc-form-alert" role="alert">
            {alert === "invalid" && "Please check the highlighted fields."}
            {alert === "rate_limited" && <>You&apos;ve sent several messages in a short time. Please wait a few minutes and try again, or call us{callUs}.</>}
            {alert === "too_large" && "Your message is too long. Please shorten it and try again."}
            {(alert === "unavailable" || alert === "network") && <>We couldn&apos;t send your message right now — please call us{callUs}.</>}
          </p>
        ) : null}
        <div>
          <label className="oc-form-label" htmlFor={fid("fullName")}>
            Full name<span className="oc-form-req" aria-hidden="true"> *</span>
          </label>
          <input
            id={fid("fullName")}
            className="oc-form-control"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            maxLength={120}
            value={edits.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={describedBy("fullName")}
          />
          {error("fullName")}
        </div>
        <div className="oc-form-row">
          <div>
            <label className="oc-form-label" htmlFor={fid("email")}>
              Email
            </label>
            <input
              id={fid("email")}
              className="oc-form-control"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={edits.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={describedBy("email", fid("contact-hint"))}
            />
            {error("email")}
          </div>
          <div>
            <label className="oc-form-label" htmlFor={fid("phone")}>
              Mobile number
            </label>
            <input
              id={fid("phone")}
              className="oc-form-control"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={edits.phone}
              onChange={(e) => set("phone", e.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={describedBy("phone", fid("contact-hint"))}
            />
            {error("phone")}
            <p className="oc-form-hint" id={fid("contact-hint")}>
              Email or mobile — whichever you prefer.
            </p>
          </div>
        </div>
        <div className="oc-form-row">
          <div>
            <label className="oc-form-label" htmlFor={fid("interest")}>
              I&apos;m interested in
            </label>
            <select id={fid("interest")} className="oc-form-control" name="interest" value={interest} onChange={(e) => set("interest", e.target.value as Interest)}>
              {INTEREST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="oc-form-label" htmlFor={fid("preferredBranchId")}>
              Preferred branch
            </label>
            <select
              id={fid("preferredBranchId")}
              className="oc-form-control"
              name="preferredBranchId"
              value={branchId}
              onChange={(e) => set("preferredBranchId", e.target.value)}
              aria-invalid={errors.preferredBranchId ? true : undefined}
              aria-describedby={describedBy("preferredBranchId")}
            >
              <option value="">No preference</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {error("preferredBranchId")}
          </div>
        </div>
        <div>
          <label className="oc-form-label" htmlFor={fid("message")}>
            Message
          </label>
          <textarea
            id={fid("message")}
            className="oc-form-control"
            name="message"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => set("message", e.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={describedBy("message")}
          />
          {error("message")}
        </div>
        <div className="oc-form-checks">
          <label className="oc-form-check">
            <input type="checkbox" name="smsConsent" checked={edits.smsConsent} onChange={(e) => set("smsConsent", e.target.checked)} />
            <span>You may text me about this enquiry</span>
          </label>
          <label className="oc-form-check">
            <input type="checkbox" name="marketingConsent" checked={edits.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
            <span>Send me occasional offers and eye-care reminders</span>
          </label>
        </div>
        <div className="oc-form-hp" aria-hidden="true">
          <label htmlFor={fid("website")}>Website (leave empty)</label>
          <input id={fid("website")} name="website" type="text" tabIndex={-1} autoComplete="off" value={edits.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        <div className="oc-form-foot">
          <p className="oc-form-note">
            We use your details only to reply to you. See our <Link href="/privacy">privacy notice</Link>.
          </p>
          <button type="submit" className="oc-btn oc-btn--brand oc-btn--lg" disabled={status === "pending"}>
            {status === "pending" ? "Sending…" : submitLabel}
          </button>
        </div>
      </form>
    );
  }

  return card ? <div className="oc-form-card">{body}</div> : body;
}
