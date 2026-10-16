import Link from "next/link";
import type { ApiFailure } from "@/lib/api";
import { telHref } from "@/lib/format";

/*
 * Friendly state shown instead of a data section when the dashboard API can't be reached
 * ("unavailable") or the site isn't connected yet ("not_configured"). Styled with the existing
 * .oc-notice / .oc-empty classes. Never shows technical details beyond the setup hint.
 */
export function ApiState({ reason, what = "This information", phone, className = "oc-container oc-state" }: { reason: ApiFailure; what?: string; phone?: string | null; className?: string }) {
  return (
    <div className={className} data-api-state={reason}>
      {reason === "not_configured" ? (
        <p className="oc-notice" role="note">
          <span>
            <strong>Setup needed.</strong> This website isn&apos;t connected to its business data yet. Set <code>DASHBOARD_API_URL</code> and{" "}
            <code>DASHBOARD_SITE_KEY</code> (see README → Environment).
          </span>
        </p>
      ) : null}
      <div className="oc-empty">
        <p>
          {reason === "not_configured"
            ? `${what} will appear here once the website is connected.`
            : `${what} is temporarily unavailable. Please try again in a minute${phone ? "" : "."}`}
          {reason !== "not_configured" && phone ? (
            <>
              , or call us on <a className="oc-text-link" href={telHref(phone)}>{phone}</a>.
            </>
          ) : null}
        </p>
        <Link className="oc-btn oc-btn--outline" href="/contact">
          Contact us
        </Link>
      </div>
    </div>
  );
}
