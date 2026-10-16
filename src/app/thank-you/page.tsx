import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getSite } from "@/lib/api";
import { telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { REPLY_TIME } from "@/lib/site-settings";

/* Generic "message received" page (e.g. for a GoHighLevel form redirect). The site's own forms
   confirm inline and don't navigate here. */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Message received",
  description: "Thanks for getting in touch.",
  path: "/thank-you",
  noindex: true,
});

export default async function ThankYouPage() {
  const result = await getSite();
  const phone = result.ok ? result.data.business.phone : null;

  return (
    <section>
      <div className="oc-container oc-confirm">
        <div className="oc-confirm__card">
          <div className="oc-confirm__icon">
            <Icon name="check" />
          </div>
          <h1 className="oc-confirm__title">Thanks — we&apos;ve got your message.</h1>
          <p className="oc-confirm__body">
            A member of our team will get back to you, {REPLY_TIME}.
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
          </p>
          <div className="oc-confirm__actions">
            <Link className="oc-btn oc-btn--brand" href="/book">
              Book an eye exam
            </Link>
            <Link className="oc-btn oc-btn--outline" href="/eyewear">
              Browse eyewear
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
