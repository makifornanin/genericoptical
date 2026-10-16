import "@/styles/pages/contact.css";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { InquiryForm } from "@/components/InquiryForm";
import { PageIntro } from "@/components/SectionHead";
import { getSite } from "@/lib/api";
import { groupedHours, telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { REPLY_TIME } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Contact us",
  description: "Questions about eye exams, glasses, contact lenses or an order? Send us a message or call a branch.",
  path: "/contact",
});

export default async function ContactPage() {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const b = site?.business;

  return (
    <>
      <PageIntro eyebrow="Contact" title="Ask us anything.">
        Questions about an exam, a frame you saw, an order in progress or your contact lenses — send a message and we&apos;ll reply, {REPLY_TIME}.
      </PageIntro>
      <section>
        <div className="oc-container oc-contact">
          <div>
            {/* The form posts to this site's /api/inquiry, which forwards it to the dashboard — it
                works even while the business profile below can't be loaded. */}
            <InquiryForm kind="contact" title="Website inquiry form" branches={(site?.branches ?? []).map((br) => ({ id: br.id, name: br.name }))} phone={b?.phone ?? null} />
            <p className="oc-contact__routing">Messages reach our customer team, who pass them to your preferred branch.</p>
          </div>
          <div>
            {b && (b.phone || b.email) ? (
              <>
                <p className="oc-eyebrow">Reach us directly</p>
                <div className="oc-contact__direct">
                  {b.phone ? (
                    <p>
                      <Icon name="phone" className="oc-icon--muted" />
                      <a href={telHref(b.phone)}>{b.phone}</a>
                    </p>
                  ) : null}
                  {b.email ? (
                    <p>
                      <Icon name="mail" className="oc-icon--muted" />
                      <a href={`mailto:${b.email}`}>{b.email}</a>
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {!site ? (
              <p className="oc-notice" role="note" data-api-state={result.ok ? "unavailable" : result.reason}>
                <span>Our branch details are temporarily unavailable. You can still send us a message with the form.</span>
              </p>
            ) : null}
            {(site?.branches ?? []).map((br) => (
              <div className="oc-contact-branch" key={br.id}>
                <h2 className="oc-contact-branch__name">{br.name}</h2>
                {br.address.length ? (
                  <p className="oc-contact-branch__line">
                    <Icon name="pin" />
                    <span>
                      {br.address.join(", ")}
                      {br.mapUrl ? (
                        <>
                          {" · "}
                          <a className="oc-text-link" href={br.mapUrl} target="_blank" rel="noopener">
                            Map<span className="oc-sr-only"> (opens in a new tab)</span>
                          </a>
                        </>
                      ) : null}
                    </span>
                  </p>
                ) : null}
                {br.phone ? (
                  <p className="oc-contact-branch__line">
                    <Icon name="phone" />
                    <a href={telHref(br.phone)}>{br.phone}</a>
                  </p>
                ) : null}
                <p className="oc-contact-branch__line">
                  <Icon name="clock" />
                  <span>{groupedHours(br.hours).map((g) => `${g.days} ${g.time}`).join(" · ")}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
