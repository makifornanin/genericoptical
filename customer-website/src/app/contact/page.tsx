import { GhlInquiryForm } from "@/components/GhlEmbeds";
import { getSite } from "@/lib/api";
import { telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Contact us", description: "Send us a message or call a branch.", path: "/contact" });

/* The message form is the business's own GoHighLevel form: submissions go straight to GoHighLevel. */

export default async function ContactPage(props: PageProps<"/contact">) {
  const [site, search] = await Promise.all([getSite(), props.searchParams]);
  const b = site.ok ? site.data.business : null;
  const branches = site.ok ? site.data.branches : [];
  const product = typeof search.product === "string" ? search.product.slice(0, 200) : null;
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Contact us</h1>
        <p>
          {product
            ? `Ask about ${product}: availability, sizing, lenses or anything else. Mention the frame in your message so we know which one you mean.`
            : "Questions about frames, lenses, an order or an appointment? Send us a message."}
        </p>
      </header>
      <div className="split">
        <div className="split__aside" style={{ display: "grid", gap: 18, alignContent: "start" }}>
          {b?.phone ? (
            <p>
              <span className="eyebrow" style={{ display: "block" }}>
                Call
              </span>
              <a href={telHref(b.phone)} className="link" style={{ fontSize: 20 }}>
                {b.phone}
              </a>
            </p>
          ) : null}
          {b?.email ? (
            <p>
              <span className="eyebrow" style={{ display: "block" }}>
                Email
              </span>
              <a href={`mailto:${b.email}`} className="link" style={{ fontSize: 20 }}>
                {b.email}
              </a>
            </p>
          ) : null}
          <ul style={{ display: "grid", gap: 10 }}>
            {branches.map((br) => (
              <li key={br.id}>
                <strong style={{ fontWeight: 500 }}>{br.name}</strong>
                {br.phone ? (
                  <>
                    {" · "}
                    <a href={telHref(br.phone)} className="link">
                      {br.phone}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <GhlInquiryForm />
      </div>
    </div>
  );
}
