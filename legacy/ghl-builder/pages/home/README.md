# Home — `/`

- **SEO title:** {Business} — Eye care & eyewear
- **SEO description:** Comprehensive eye examinations, prescription eyewear and contact lens fittings — with optometrists who take the time to explain your options.
- **Reference:** `screenshots/desktop/home.png`, `screenshots/mobile/home.png`, `screenshots/compare/home-desktop.png`

## Sections, top to bottom

| # | Paste | What it is | Content comes from |
|---|---|---|---|
| — | OC Header (Universal section) | Promo banner, logo, menu, "Book an exam" | `OC_CONFIG.business/nav/promo` |
| 1 | `blocks/01-hero.html` | Hero: eyebrow, headline, intro, two buttons, 3 stats, 3 product images | Copy in the block (or `OC_CONFIG.hero.title/body`); stats are computed; images from `hero.products` |
| 2 | `blocks/02-services.html` | "01 Services": numbered rows with duration, price and Book link | `OC_CONFIG.services` where `featured: true` |
| 3 | `blocks/03-featured-eyewear.html` | "02 Eyewear": 8 product cards | `OC_CATALOGUE` products with `featured` 1–8 |
| 4 | `blocks/04-approach.html` | "03 Our approach": text + 4 value cards | Static copy in the block |
| 5 | `blocks/05-testimonials.html` | "04 In their words": 3 quotes | `OC_CONFIG.testimonials` (labelled **Sample** while `sample: true`; hidden when `enabled: false`) |
| 6 | `blocks/06-branches.html` | "05 Visit us": branch cards with live Open/Closed badge, hours, Book here / Map | `OC_CONFIG.branches` (+ `business.timezone`) |
| 7 | `blocks/07-cta-faq.html` | Dark booking panel + first 4 FAQs | `OC_CONFIG.faqs` |
| — | `99-page-script.html` | Catalogue data + `home.js` | `scripts/oc-catalogue.js`, `pages/home/home.js` |
| — | OC Footer (Universal section) | Footer + config + core script | |

Page CSS: `00-page-custom-css.css` (= `home.css`) → page Settings → Custom CSS.

## Links from this page

- "Book an eye exam" and "Book an appointment" → `/book`
- Service "Book" → `/book?service=<id>`
- Branch "Book here" → `/book?branch=<id>`
- Product cards → `/eyewear-item?p=<id>`
- "See all eyewear" → `/eyewear`
- "All questions" → `/faq`
- "Ask a question" → `/contact`

## Notes

- The hero copy mentions "three branches": edit it, or set `hero.body`, to match the business.
- The open/closed badge is computed in the visitor's browser for the business time zone. It updates on each page load.
- Testimonials must be real, attributable reviews used with permission. Until then, keep the visible "Sample" label or hide the section.
