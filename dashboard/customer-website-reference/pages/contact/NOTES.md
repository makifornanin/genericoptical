# Contact — `/contact`

| | |
|---|---|
| Original source | `src/app/(site)/contact/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `Container`, `Eyebrow`, `PageIntro` (`site-ui.tsx`); `InquiryForm` (`inquiry-form.tsx`) |
| Data | `getSite()` → business phone/email, active branches (name, address, phone) |
| Backend action | `submitInquiryAction` → `capturePublicLead()` (`kind: "contact"`) |
| `<title>` | `Contact us · Lensmere Optical` |
| Meta description | "Questions about eye exams, glasses, contact lenses or an order? Send us a message." |
| Screenshots | `screenshots/contact-desktop.png`, `contact-mobile.png` (empty form; the success state was not captured because no form may be submitted) |
| Standalone | `standalone/contact.html` |

## Sections, top to bottom

### 1. Page intro (static)
Eyebrow "Contact", H1 "Ask us anything.", body "Questions about an exam, a frame you saw, an order in progress or your contact lenses — send a message and we'll reply within one business day."

### 2. Inquiry form (left, `1.3fr` ≥ 1024px)
`InquiryForm` in contact mode — interest defaults to "Other", empty message, submit label "Send message". Fields: Full name * · Email · Mobile number (hint "Email or mobile — whichever you prefer.") · "I'm interested in" select · "Preferred branch" select (only shown with > 1 branch; "No preference" + branches) · Message (4 rows) · 2 consent checkboxes · privacy note + submit. Two-column field rows from 640px. Details, validation and success state: `../../components/COMPONENTS.md` → InquiryForm.

What happens on submit (original): a Lead is created (or, if the same email/phone submitted in the last 30 days and the lead is still open, an "inquiry" activity is added to it and consents are OR-ed) with source "website", the chosen interest, preferred branch, message, `smsConsent`, `marketingConsent`.

### 3. Aside (right, `1fr`)
- "Reach us directly": phone (tel:) and email (mailto:) with icons.
- One block per active branch: name (display 19px), map-pin + address, phone + tel: link; separated by hairlines.
- **Responsive:** stacked under the form < 1024px.
