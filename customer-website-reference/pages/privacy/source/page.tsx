import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalPage } from "../legal";
import { getSite } from "../site-data";

export const metadata: Metadata = { title: "Privacy notice" };

async function Privacy() {
  const site = await getSite();
  if (!site) return null;
  const { biz } = site;
  const name = biz.legalName ?? biz.name;
  const contact = biz.websiteContent.privacyContactEmail ?? biz.email ?? "our branches";
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy notice"
      intro={
        <p>
          {name} (&ldquo;we&rdquo;) collects only the personal information needed to look after your eyes and your orders. This notice explains what we collect, why, and the choices you have.
        </p>
      }
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul>
              <li>Contact details you give us: name, phone number, email address.</li>
              <li>Appointment and order history, payments and balances.</li>
              <li>Clinical information recorded during an examination, including prescriptions. This is health information and is handled with extra care.</li>
              <li>Messages you send through this website, and the branch you prefer.</li>
            </ul>
          ),
        },
        {
          heading: "Why we use it",
          body: (
            <ul>
              <li>To book, confirm and remind you about appointments.</li>
              <li>To make, fit and deliver eyewear and contact lenses to your prescription.</li>
              <li>To reply to enquiries and tell you when an order is ready.</li>
              <li>To send offers or eye-care reminders — only if you opted in. You can opt out at any time.</li>
            </ul>
          ),
        },
        {
          heading: "Who can see it",
          body: (
            <p>
              Access is limited to staff who need it for their role; prescriptions are visible only to authorised clinical and dispensing staff. We share details with laboratories that make your lenses and with service providers that send messages on our behalf, under confidentiality obligations. We do not sell personal information.
            </p>
          ),
        },
        {
          heading: "How long we keep it",
          body: <p>Clinical and financial records are kept for as long as the law requires. Enquiries that don&apos;t become appointments or orders are archived when no longer needed.</p>,
        },
        {
          heading: "Your rights",
          body: (
            <p>
              You may ask to see, correct or delete your information, or withdraw consent for marketing, by contacting{" "}
              {contact.includes("@") ? (
                <a className="underline underline-offset-2" href={`mailto:${contact}`}>
                  {contact}
                </a>
              ) : (
                contact
              )}
              . Some records must be retained for legal reasons; we&apos;ll explain if that applies.
            </p>
          ),
        },
      ]}
    />
  );
}

export default function PrivacyPage() {
  return (
    <Suspense fallback={<div className="h-[70vh]" />}>
      <Privacy />
    </Suspense>
  );
}
