# Design system

The visual language of the original customer website (`customer-website-reference/` in the dashboard repository), carried over unchanged except where noted under "Changes from the original". The Next.js app uses the same markup structure, class names and CSS as the GHL-builder version it replaced (kept in `legacy/ghl-builder/`).

**Character:**
- near-monochrome ink on a warm off-white canvas, with one dark brand colour and one restrained accent;
- hairline structure: 1px lines rather than shadows;
- two typefaces;
- product illustrations on soft stone tiles;
- no gradients, decorative blobs or motion beyond tiny hover transitions.

**Where the styles live:**

| File | Contents | Loaded by |
|---|---|---|
| `src/styles/oc-base.css` | Global tokens and components (unchanged from the GHL version) | `src/app/layout.tsx` |
| `src/styles/pages/<page>.css` | Page sections: home, eyewear, product-detail, services, booking, contact, faq, about | the matching `src/app/**/page.tsx` |
| `src/styles/forms.css` | The inquiry form (`.oc-form*`), recreated from the original website's form | `src/components/InquiryForm.tsx` |
| `src/styles/app.css` | Next.js glue: `<body>` reset, next/font families → font tokens, a few small additions | `src/app/layout.tsx` |

**Every selector is scoped under `.oc`** and every custom property is prefixed `--oc-`. In the app the root wrapper (`<div class="oc oc-root">` in the layout) carries `.oc`, so page sections need no `.oc` of their own; the header (`.oc.oc-header-wrap`) and footer (`.oc.oc-footer`) keep it because their selectors are compound.

## Colour tokens

Defined on `.oc` in `oc-base.css` §1.

| Token | Value | Use |
|---|---|---|
| `--oc-brand` | `#1f2b22` (theme) | Primary buttons, footer, CTA panel, step numbers |
| `--oc-brand-ink` | auto (`#fff` / `#18191b`) | Text on brand: picked by contrast (`src/lib/theme.ts`) |
| `--oc-accent` | `#b5e14a` (theme) | Accent buttons on dark panels, selection, confirmation icon |
| `--oc-accent-ink` | auto | Text on accent |
| `--oc-canvas` | `#f6f6f3` | Page background |
| `--oc-surface` | `#ffffff` | Cards, form card, featured-products band |
| `--oc-surface-2` | `#fafaf8` | Placeholders |
| `--oc-ink` / `--oc-text` | `#18191b` | Headings, body emphasis, selected pills and chips |
| `--oc-text-2` | `#5c5e63` | Body copy, form labels |
| `--oc-text-3` | `#66686d` | Meta text, eyebrows, hints (see changes) |
| `--oc-line` | `#e7e7e2` | Hairlines, card borders |
| `--oc-line-strong` | `#d5d5cf` | Control borders, outline buttons |
| `--oc-art-bg` | `#efeee8` | Product image tiles |
| `--oc-pos` / `--oc-pos-soft` | `#2e6b35` / `#e8f3e3` | "Open" badge, "In stock" tag |
| `--oc-warn` / `--oc-warn-soft` | `#7a4f00` / `#fbf1dc` | "Low stock" tag, sample/draft/setup notices |
| `--oc-muted-soft` | `#efefea` | "Closed" badge, plain tags ("Out of stock — ask us", "Made to order") |
| `--oc-danger` / `--oc-danger-soft` | `#b42318` / `#fdecea` | Form errors (`forms.css`) |

**Theming:** the business colours come from the dashboard API (`business.brandColor`, `accentColor`). The root layout writes them server-side as `--oc-theme-brand`, `--oc-theme-brand-ink`, `--oc-theme-accent`, `--oc-theme-accent-ink` on the root wrapper (no client JavaScript); the tokens fall back to the defaults above when a colour is missing or invalid.

**Contrast:**
- Body and meta text meet WCAG AA (4.5:1) on the canvas, white and stone tiles; axe tests enforce this.
- The automatic ink colour keeps button text legible on any brand or accent colour.

## Typography

- **Body:** Inter Tight (400–700). **Display:** Instrument Sans 600, letter-spacing −0.02em. Both are self-hosted with `next/font/google` (downloaded at build time; visitors never contact Google) and wired to `--oc-font-sans` / `--oc-font-display` in `app.css`.
- **Monospace:** index numbers only ("01", "02" …), using the system mono stack.
- **Eyebrow:** 12px, 600, uppercase, letter-spacing 0.14em, `--oc-text-3`.

| Role | Size (mobile → ≥640px) | Line height |
|---|---|---|
| Hero h1 | 42 → 64px | 1.02 |
| Page h1 | 40 → 56px | 1.04 |
| Section h2 | 30 → 38px | 1.1 |
| CTA h2 | 32 → 44px | 1.08 |
| Product h1 | 38 → 46px | 1.05 |
| Card titles | 19–22px | 1.25 |
| Intro body | 17px | 1.625 |
| Body | 14–16px | 1.625 |
| Meta, form labels | 12.5–13.5px | 1.5 |

## Layout and spacing

| Item | Value |
|---|---|
| Container | max 1200px, gutters 20px (phone) / 32px (≥640px) |
| Breakpoints | 640, 768, 900 (header menu), 1024, 1440 |
| Section rhythm | 80px vertical padding. Section heads sit on a hairline with a 200px label column on ≥768px. |
| Radii | controls 10px · cards 20px · large panels 24–28px · pills fully rounded |
| Header | 64px, sticky, translucent canvas with blur |

## Components

Class names are in the CSS and the React components (`src/components/`, `src/app/`).

| Component | Classes | Where |
|---|---|---|
| Banner | `oc-promo` | Header: demo notice for a demo business, or the promo (`src/lib/site-settings.ts`, off by default) |
| Header, nav, mobile menu | `oc-header`, `oc-brand`, `oc-nav`, `oc-menu-btn`, `oc-mobile-nav` | Global (`SiteHeader.tsx`) |
| Footer | `oc-footer`, `oc-footer__*`, `oc-hours-row` | Global (`SiteFooter.tsx`) |
| Buttons | `oc-btn` + `--brand` / `--accent` / `--outline` / `--light`, `--lg`, `--block` | Everywhere |
| Links | `oc-arrow-link`, `oc-underline-link`, `oc-text-link`, `oc-back` | Everywhere |
| Eyebrow + index | `oc-eyebrow`, `oc-eyebrow__index` | Section heads |
| Page intro | `oc-intro`, `oc-intro__title`, `oc-intro__body` | Inner pages |
| Section head | `oc-section-head`, `__title`, `__body`, `__action` | Sections |
| Product tile + card | `oc-art`, `oc-product-grid`, `oc-product-card` (+ availability tag in `__foot`) | Home, Eyewear, Product |
| Hero, stats, hero art | `oc-hero`, `oc-stats`, `oc-hero-art` | Home |
| Service rows | `oc-service-rows` | Home |
| Values grid | `oc-values` | Home |
| Quote cards | `oc-quotes`, `oc-quote` | Home (disabled by default) |
| Branch cards / strip | `oc-branch-card`, `oc-branch-strip`, `oc-status` | Home, About |
| CTA panel | `oc-cta` (+ `--single`), `oc-faq-mini` | Home, Services |
| Pills + search | `oc-pills`, `oc-pill`, `oc-search`, `oc-input` | Eyewear |
| Chips, availability | `oc-chips`, `oc-chip`, `oc-availability`, `oc-availability__branches` | Product |
| Inquiry form | `oc-form-card`, `oc-form`, `oc-form-row`, `oc-form-label`, `oc-form-control`, `oc-form-hint`, `oc-form-error`, `oc-form-checks`, `oc-form-check`, `oc-form-foot`, `oc-form-note`, `oc-form-alert`, `oc-form-done` | Contact, Product, Book |
| Service cards, price list | `oc-svc-card`, `oc-price-list` | Services |
| Steps and choices | `oc-step`, `oc-choices`, `oc-choice` | Book |
| Booking widget slot | `oc-embed` | Book (official GoHighLevel booking iframe) |
| FAQ list, aside card | `oc-faq__list`, `oc-aside-card` | FAQ |
| Legal layout | `oc-legal`, `oc-legal__toc`, `oc-legal__section` | Privacy, Terms |
| Confirmation card | `oc-confirm` | Booking confirmed, Thank you, Not found |
| Notice, empty state, tag | `oc-notice`, `oc-empty`, `oc-tag` (+ `--warn`, `--pos`) | Draft/setup/outage states, availability, "Sample" |

## Rules

- One h1 per page, then h2 → h3. Every interactive element is a real `<a>` or `<button>`, with a visible focus ring (2px ink outline; form controls use an ink border + soft ring).
- Touch targets are at least 40px (menu button 44px). No horizontal scrolling at any width from 360px up; tests check 390, 768, 1280 and 1920px.
- Respect `prefers-reduced-motion`: transitions are disabled.
- **Don't add:** gradients, glows, oversized shadows, decorative shapes, scroll animations, carousels.

## Changes from the original (and why)

| Change | Reason |
|---|---|
| `--oc-text-3` darkened from `#86888d` to `#66686d`; category-pill counts no longer faded with opacity | WCAG AA contrast (the original was about 3.3:1 on the canvas) |
| Header menu switches to the hamburger below 900px (was 768px) | Avoids a cramped menu next to the logo and button at tablet width |
| Very narrow phones (<480px): card price stacks under the name | Long names were truncated to almost nothing |
| Featured and related product rows, and testimonials, go to 4 / 3 columns from 1024px (were 768px); 2 / 1 columns on tablets | At tablet width names and prices were truncated and quotes were cramped |
| Inquiry form restored (it had become a native GHL form in the GHL version), with form controls 40px tall (were 36px) | The site posts inquiries to its own server again; 40px keeps the touch-target rule |
| Booking date/time picker replaced by the official GoHighLevel booking widget; branch and service steps kept. Without a calendar for the branch: an appointment-request form | GoHighLevel is the system of record for appointments |
| Product inquiry form opens on demand ("Ask about this") instead of always showing | Faster page; the form loads only when needed |
| Product page: one image (the API provides one), availability per option with the branches that have it; no "Buy online" | Data comes from the dashboard; online ordering isn't offered |
| Availability tags on product cards ("In stock", "Low stock", "Out of stock — ask us", "Made to order") | Coarse live availability from the dashboard |
| Testimonials off by default (sample text) | Only real, attributable reviews should be published |
| Draft legal notice; privacy text describes the website → dashboard → CRM flow | Flagged for legal review |
