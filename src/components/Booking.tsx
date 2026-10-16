"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import type { Branch, Service } from "@/lib/api-types";
import { branchParam, calendarFor, interestForService } from "@/lib/catalog";
import { money, servicePrice, telHref, type MoneyFormat } from "@/lib/format";
import { HoursRows } from "./HoursRows";
import { InquiryForm } from "./InquiryForm";

/*
 * Booking (ported from pages/booking/booking.js): choose a branch and a service, then book in the
 * OFFICIAL GoHighLevel booking widget for that service at that branch. GoHighLevel is the system of
 * record for appointments; this page never stores bookings. Calendar IDs come only from the
 * dashboard (service.calendars). Without one, the page says online booking isn't connected for that
 * branch yet and offers an appointment *request* (a lead — staff call to confirm a time).
 * Deep links: /book?branch=<branch id or code>&service=<service code>.
 */

const EMBED_SCRIPT = "https://link.msgsndr.com/js/form_embed.js";

interface Props {
  branches: Branch[];
  services: Service[];
  widgetBase: string | null;
  initialBranchId: string | null;
  initialServiceId: string | null;
  businessPhone: string | null;
  fmt: MoneyFormat;
}

export function Booking({ branches, services, widgetBase, initialBranchId, initialServiceId, businessPhone, fmt }: Props) {
  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? null);
  const [serviceId, setServiceId] = useState(initialServiceId ?? services[0]?.id ?? null);
  const branch = branches.find((b) => b.id === branchId) ?? null;
  const service = services.find((s) => s.id === serviceId) ?? null;
  const calendarId = widgetBase ? calendarFor(service, branch) : null;
  const widgetSrc = calendarId && widgetBase ? `${widgetBase}${encodeURIComponent(calendarId)}` : null;

  // Keep the choice in the URL (shareable, survives reload) without a navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (branch) url.searchParams.set("branch", branchParam(branch));
    if (service) url.searchParams.set("service", service.code);
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(null, "", next);
  }, [branch, service]);

  const showBranches = branches.length > 1;
  const showServices = services.length > 1;
  let step = 0;
  const num = () => String(++step);
  const label = [service?.name, branch?.name].filter(Boolean).join(" · ");
  const phone = branch?.phone ?? businessPhone;

  return (
    <div className="oc-container oc-booking">
      <div className="oc-booking-card">
        {showBranches ? (
          <div className="oc-step">
            <h2 className="oc-step__title">
              <span className="oc-step__num">{num()}</span>Choose a branch
            </h2>
            <div className={`oc-choices ${branches.length === 2 ? "oc-choices--2" : "oc-choices--3"}`} role="group" aria-label="Branch">
              {branches.map((b) => (
                <button key={b.id} type="button" className="oc-choice" aria-pressed={b.id === branchId} onClick={() => setBranchId(b.id)}>
                  <span className="oc-choice__name">{b.name}</span>
                  <span className="oc-choice__sub">{b.address.join(", ")}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {showServices ? (
          <div className="oc-step">
            <h2 className="oc-step__title">
              <span className="oc-step__num">{num()}</span>Choose a service
            </h2>
            <div className="oc-choices oc-choices--2" role="group" aria-label="Service">
              {services.map((s) => {
                const meta = [s.durationMinutes ? `${s.durationMinutes} min` : "", s.priceCents === null ? "" : servicePrice(s.priceCents, fmt)].filter(Boolean).join(" · ");
                return (
                  <button key={s.id} type="button" className="oc-choice" aria-pressed={s.id === serviceId} onClick={() => setServiceId(s.id)}>
                    <span className="oc-choice__name">{s.name}</span>
                    {meta ? <span className="oc-choice__sub">{meta}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="oc-step">
          <h2 className="oc-step__title">
            <span className="oc-step__num">{num()}</span>
            {widgetSrc ? "Pick a date and time" : "Request an appointment"}
          </h2>
          <p className="oc-booking__services" role="status" aria-live="polite">
            {service || branch ? (
              <>
                <strong>{service ? service.name : "Appointment"}</strong>
                {branch ? ` · ${branch.name}` : ""}
                {service?.durationMinutes ? ` · ${service.durationMinutes} min` : ""}
                {service?.priceCents ? ` · ${money(service.priceCents, fmt)}` : ""}.{" "}
                {widgetSrc
                  ? "Choose a date and time below — the calendar shows live availability."
                  : `Online booking for ${branch ? `our ${branch.name} branch` : "this branch"} isn't connected yet.`}
              </>
            ) : (
              "Choose a date and time below."
            )}
          </p>
          {widgetSrc ? (
            <div className="oc-embed" style={{ marginTop: 16 }} data-booking-widget>
              <iframe
                key={widgetSrc}
                src={widgetSrc}
                title={`Book an appointment — ${label}`}
                id={`${calendarId}_oc`}
                scrolling="no"
                style={{ width: "100%", minHeight: 820, border: "none", overflow: "hidden" }}
                loading="lazy"
              />
              <Script src={EMBED_SCRIPT} strategy="afterInteractive" />
            </div>
          ) : (
            <div className="oc-booking__request" data-booking-request>
              <p className="oc-notice" role="note">
                <span>
                  <strong>Send a request instead.</strong> Tell us when suits you and we&apos;ll call to confirm a time. This sends a message to our team — your
                  appointment isn&apos;t booked until we confirm it.
                </span>
              </p>
              <div style={{ marginTop: 16 }}>
                <InquiryForm
                  kind="appointment_request"
                  title={`Request an appointment${label ? ` — ${label}` : ""}`}
                  card={false}
                  branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                  defaultBranchId={branch?.id ?? null}
                  defaultInterest={interestForService(service)}
                  messagePrefix={`Appointment request: ${label || "appointment"}.`}
                  defaultMessage=""
                  phone={phone}
                  submitLabel="Send request"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="oc-booking-aside" aria-label="Booking information">
        <div>
          <p className="oc-eyebrow">How it works</p>
          <ol className="oc-booking-aside__list">
            <li>
              <span className="oc-mono">01</span>
              <span>Choose a branch and the service you need.</span>
            </li>
            <li>
              <span className="oc-mono">02</span>
              <span>{widgetSrc ? "Pick an open time in the calendar and add your details." : "Send your details and the times that suit you."}</span>
            </li>
            <li>
              <span className="oc-mono">03</span>
              <span>
                {widgetSrc
                  ? "You'll get a confirmation by email or text; we'll call if anything needs checking."
                  : "We'll call or message you to confirm a time."}
              </span>
            </li>
          </ol>
        </div>
        {branch ? (
          <div>
            <p className="oc-eyebrow">Opening hours {branches.length > 1 ? <span>· {branch.name}</span> : null}</p>
            <ul className="oc-booking-aside__hours">
              <HoursRows hours={branch.hours} />
            </ul>
          </div>
        ) : null}
        {phone ? (
          <div>
            <p className="oc-eyebrow">Prefer to call?</p>
            <a className="oc-booking-aside__phone" href={telHref(phone)}>
              {phone}
            </a>
            <p className="oc-booking-aside__note">Need to change or cancel? Use the link in your confirmation, or call the branch.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
