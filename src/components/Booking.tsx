"use client";

import Script from "next/script";
import { useState } from "react";
import type { Branch, Interest, Service } from "@/lib/api-types";
import { servicePrice, type MoneyFormat } from "@/lib/format";
import { EMBED_SCRIPT } from "@/lib/ghl";
import { InquiryForm } from "./InquiryForm";

const interestFor = (s: Service | undefined): Interest => (s?.code.includes("contact") ? "contact_lenses" : s?.code.includes("exam") ? "eye_exam" : "prescription_glasses");

/**
 * GoHighLevel's official booking widget. When the dashboard maps calendars to services and branches,
 * the visitor picks both and gets that calendar. Otherwise the business's own booking calendar
 * (`defaultCalendarUrl`) is shown on its own. With neither, an appointment request (a lead the branch
 * calls back to confirm).
 */
export function Booking({ services, branches, widgetBase, defaultCalendarUrl, fmt, initialService, initialBranch }: { services: Service[]; branches: Branch[]; widgetBase: string | null; defaultCalendarUrl: string | null; fmt: MoneyFormat; initialService?: string; initialBranch?: string }) {
  const [serviceId, setServiceId] = useState(services.find((s) => s.code === initialService || s.id === initialService)?.id ?? services[0]?.id ?? "");
  const [branchId, setBranchId] = useState(branches.find((b) => b.code === initialBranch || b.id === initialBranch)?.id ?? branches[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId);
  const branch = branches.find((b) => b.id === branchId);
  const calendar = service?.calendars.find((c) => c.branchId === branchId);
  const src = widgetBase && calendar ? `${widgetBase}${encodeURIComponent(calendar.calendarId)}` : defaultCalendarUrl;

  if (defaultCalendarUrl && !services.some((s) => s.calendars.length)) {
    return (
      <div>
        <iframe src={defaultCalendarUrl} title="Book an appointment" className="booking-frame" scrolling="no" allow="payment" id="ghl-booking-calendar" />
        <Script src={EMBED_SCRIPT} strategy="lazyOnload" />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div>
        <p className="options__label" id="bk-service">
          What would you like to book?
        </p>
        <div className="options" role="radiogroup" aria-labelledby="bk-service">
          {services.map((s) => (
            <label key={s.id} className={`option${s.id === serviceId ? " is-selected" : ""}`}>
              <input type="radio" name="service" checked={s.id === serviceId} onChange={() => setServiceId(s.id)} />
              <span className="option__head">
                <span>{s.name}</span>
                <span className="option__price">{servicePrice(s.priceCents, fmt)}</span>
              </span>
              <span className="option__body" style={{ display: "block" }}>
                {[s.description, s.durationMinutes ? `${s.durationMinutes} minutes` : null].filter(Boolean).join(" · ")}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="options__label" id="bk-branch">
          Where?
        </p>
        <div className="chips" role="radiogroup" aria-labelledby="bk-branch">
          {branches.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={b.id === branchId} className="chip" onClick={() => setBranchId(b.id)}>
              {b.name}
            </button>
          ))}
        </div>
      </div>
      {src ? (
        <div>
          <iframe key={src} src={src} title={`Book ${service?.name ?? "an appointment"} at ${branch?.name ?? "a branch"}`} className="booking-frame" scrolling="no" allow="payment" id={`ghl-booking-${calendar?.calendarId ?? "calendar"}`} />
          <Script src={EMBED_SCRIPT} strategy="lazyOnload" />
        </div>
      ) : (
        <div className="summary" style={{ background: "var(--stone)" }}>
          <div>
            <h3 style={{ fontSize: "var(--t-l)" }}>Request an appointment</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Online booking for this branch isn&apos;t connected yet. Send a request and {branch?.name ?? "the branch"} will call or text you to confirm a time. This doesn&apos;t book a slot until they do.
            </p>
          </div>
          <InquiryForm
            key={`${serviceId}-${branchId}`}
            kind="appointment_request"
            interest={interestFor(service)}
            branches={branches}
            sourcePage="/eye-exam"
            submitLabel="Send request"
            messageLabel="Preferred days and times"
            messagePlaceholder="e.g. Saturday morning, or weekdays after 5pm"
            initialMessage={service ? `${service.name} at ${branch?.name ?? "any branch"}.\n` : ""}
            showInterest={false}
            initialBranchId={branchId}
          />
        </div>
      )}
    </div>
  );
}
