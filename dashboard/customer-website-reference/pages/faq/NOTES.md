# FAQ — `/faq`

| | |
|---|---|
| Original source | `src/app/(site)/faq/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `Container`, `PageIntro`, `siteButton` |
| Data | `getSite()` → `websiteContent.faqs` (Settings → Website) |
| `<title>` | `Frequently asked questions · Lensmere Optical` |
| Meta description | inherited from the layout (heroBody) |
| Structured data | `<script type="application/ld+json">` FAQPage schema built from the same FAQs (`<` escaped as `<`) |
| Screenshots | `screenshots/faq-desktop.png`, `faq-mobile.png` |
| Standalone | `standalone/faq.html` (native `<details>`, JSON-LD included) |

## Sections, top to bottom

### 1. Page intro (static)
Eyebrow "FAQ", H1 "Questions, answered." (no body).

### 2. FAQ accordion (left, `1fr`)
- One native `<details>` per FAQ between hairlines; the **first is open by default**. Summary = question (display font 19px semibold) with a grey "+" that rotates 45° into "×" when open; answer 15.5px, max 680px wide. No JavaScript.
- Empty state: "No questions published yet."
- **Data:** 6 FAQs in the demo (full text in `content.md`).

### 3. "Still have a question?" card (right, 320px ≥ 1024px)
White card: title, "Send us a message and we'll get back to you, usually within one business day.", button "Contact us" → `/contact`. Stacked under the list < 1024px.
