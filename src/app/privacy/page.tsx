import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/Legal";
import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import { LEGAL } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Privacy notice",
  description: "What personal information we collect, why we use it, who can see it and your rights.",
  path: "/privacy",
});

const TOC = [
  { id: "collect", label: "What we collect" },
  { id: "use", label: "Why we use it" },
  { id: "online", label: "Online forms and bookings" },
  { id: "access", label: "Who can see it" },
  { id: "retention", label: "How long we keep it" },
  { id: "cookies", label: "Cookies" },
  { id: "rights", label: "Your rights" },
];

export default async function PrivacyPage() {
  const result = await getSite();
  const b = result.ok ? result.data.business : null;
  const legalName = b?.legalName ?? b?.name ?? null;
  const privacyEmail = (result.ok && result.data.content.privacyContactEmail) || b?.email || null;

  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy notice"
      toc={TOC}
      intro={<>{legalName ? `${legalName} (“we”) collects` : "We collect"} only the personal information needed to look after your eyes and your orders. This notice explains what we collect, why, and the choices you have.</>}
    >
      <LegalSection id="collect" num={1} title="What we collect">
        <ul>
          <li>Contact details you give us: name, phone number, email address.</li>
          <li>Appointment and order history, payments and balances.</li>
          <li>Clinical information recorded during an examination, including prescriptions. This is health information and is handled with extra care.</li>
          <li>Messages you send through this website, and the branch you prefer.</li>
        </ul>
      </LegalSection>
      <LegalSection id="use" num={2} title="Why we use it">
        <ul>
          <li>To book, confirm and remind you about appointments.</li>
          <li>To make, fit and deliver eyewear and contact lenses to your prescription.</li>
          <li>To reply to enquiries and tell you when an order is ready.</li>
          <li>To send offers or eye-care reminders — only if you opted in. You can opt out at any time.</li>
        </ul>
      </LegalSection>
      <LegalSection id="online" num={3} title="Online forms and bookings">
        <p>
          Messages you send with the forms on this website go to our practice-management system, so our team can reply and serve you in branch, and to our
          customer-communication platform, which we use to reply and to send reminders. The online booking calendar is provided by that platform: it stores your
          booking on our behalf and sends confirmations and reminders.
        </p>
      </LegalSection>
      <LegalSection id="access" num={4} title="Who can see it">
        <p>
          Access is limited to staff who need it for their role; prescriptions are visible only to authorised clinical and dispensing staff. We share details with
          laboratories that make your lenses and with service providers that run our systems or send messages on our behalf, under confidentiality obligations. We do
          not sell personal information.
        </p>
      </LegalSection>
      <LegalSection id="retention" num={5} title="How long we keep it">
        <p>Clinical and financial records are kept for as long as the law requires. Enquiries that don&apos;t become appointments or orders are deleted or archived when no longer needed.</p>
      </LegalSection>
      <LegalSection id="cookies" num={6} title="Cookies">
        <p>
          This website and the embedded booking calendar use cookies that are needed for them to work securely. If we add analytics or advertising cookies, we will ask
          for your consent first where the law requires it.
        </p>
      </LegalSection>
      <LegalSection id="rights" num={7} title="Your rights">
        <p>
          {LEGAL.jurisdiction ? `Under the laws of ${LEGAL.jurisdiction} you` : "Under applicable data-protection law you"} may ask to see, correct or delete your
          information, or withdraw consent for marketing, by contacting {privacyEmail ? <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a> : "us"}. Some records must
          be retained for legal reasons; we&apos;ll explain if that applies.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
