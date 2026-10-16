import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getSite } from "@/lib/api";
import { telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

/*
 * Where GoHighLevel calendars redirect after a booking (Calendar settings → Confirmation →
 * Redirect to <SITE_URL>/booking-confirmed). GoHighLevel sends the confirmation itself.
 */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "You're booked in",
  description: "Your appointment has been booked.",
  path: "/booking-confirmed",
  noindex: true,
});

export default async function BookingConfirmedPage() {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const b = site?.business;
  const exam = site?.services.find((s) => /exam/i.test(s.code) && s.durationMinutes);

  return (
    <section>
      <div className="oc-container oc-confirm">
        <div className="oc-confirm__card">
          <div className="oc-confirm__icon">
            <Icon name="check" />
          </div>
          <h1 className="oc-confirm__title">You&apos;re booked in.</h1>
          <p className="oc-confirm__body">
            Thanks for booking{b ? ` with ${b.name}` : ""}. Your confirmation is on its way by email or text — it has the date, time, branch and a link to reschedule.
          </p>
          <ol className="oc-confirm__next">
            <li>
              <span className="oc-mono">01</span>
              <span>Bring your current glasses or contact lenses, and any recent prescription.</span>
            </li>
            <li>
              <span className="oc-mono">02</span>
              <span>Arrive five minutes early{exam ? ` — an eye exam takes about ${exam.durationMinutes} minutes` : ""}.</span>
            </li>
            <li>
              <span className="oc-mono">03</span>
              <span>
                Need to change it? Use the link in your confirmation
                {b?.phone ? (
                  <>
                    {" "}
                    or call{" "}
                    <a className="oc-text-link" href={telHref(b.phone)}>
                      {b.phone}
                    </a>
                  </>
                ) : null}
                .
              </span>
            </li>
          </ol>
          <div className="oc-confirm__actions">
            <Link className="oc-btn oc-btn--brand" href="/eyewear">
              Browse eyewear
            </Link>
            <Link className="oc-btn oc-btn--outline" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
