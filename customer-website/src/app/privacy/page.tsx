import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Privacy notice", description: "How we collect and use your personal information.", path: "/privacy" });
export const revalidate = 3600;

export default async function PrivacyPage() {
  const site = await getSite();
  const b = site.ok ? site.data.business : null;
  const name = b?.legalName ?? b?.name ?? "We";
  const email = site.ok ? (site.data.content.privacyContactEmail ?? b?.email) : null;
  return (
    <div className="wrap legal">
      <header className="page-head">
        <h1>Privacy notice</h1>
      </header>
      <p className="notice notice--warn">Draft for review: this notice describes how this website and the shop&apos;s systems handle data. Have it checked by a lawyer before using it with real customers.</p>
      <h2>Who we are</h2>
      <p>{name} runs this website and its branches, and decides how your personal information is used.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, email address and mobile number when you place an order, send a message or request an appointment.</li>
        <li>What you order, the branch you collect from, and whether you paid online or will pay at pickup. We never receive card numbers: the online card step on this demo store runs in your browser and only the card type and last four digits are recorded.</li>
        <li>Prescription values, if you type them in when choosing lenses. These are health information: we use them only to make your lenses, and our optometrist checks them first.</li>
        <li>Your IP address with orders and messages, to prevent abuse.</li>
        <li>Your bag, kept in your own browser until you check out or clear it.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To prepare, make and hand over your order, and to contact you about it.</li>
        <li>To answer your messages and arrange appointments.</li>
        <li>To send news and offers, only if you ticked the box asking for them.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>Your details are stored in our shop management system. Customer and order records are also kept in our customer-relationship system (GoHighLevel) so our team can follow up. Lenses are made by our partner laboratory, which receives what it needs to make them. We don&apos;t sell your information.</p>
      <h2>How long we keep it</h2>
      <p>Order and payment records are kept as long as the law requires for business records. You can ask us to delete marketing contact details at any time.</p>
      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your information, or object to how we use it{email ? (
          <>
            {" "}
            by emailing <a className="link" href={`mailto:${email}`}>{email}</a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
