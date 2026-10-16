# FAQ — `/faq`

- **SEO title:** Frequently asked questions · {Business}
- **SEO description:** Appointments, prescription turnaround, payment methods, contact lenses and frame warranty — answered.
- **Reference:** `screenshots/desktop/faq.png`

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-intro.html` | Page intro |
| 2 | `blocks/02-faq.html` | Accordion of every FAQ (first one open) + "Still have a question?" card |
| — | `99-page-script.html` | `faq.js` |
| — | OC Footer | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## Notes

- **Where questions live:** `OC_CONFIG.faqs`. The same list feeds the home page's first four, so the two can't drift apart.
- **Accordions:** these are native `<details>` elements, so they open without JavaScript and work with the keyboard.
- **Structured data:** `faq.js` adds **FAQPage structured data** (JSON-LD) built from the same list.
  - If you prefer GHL's own *Schema Markup* tool (website builder → SEO & AEO), don't add a second FAQPage schema there.
