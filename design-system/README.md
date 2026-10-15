# Design system

The visual language of the original customer website (`customer-website-reference/` in the dashboard repository), carried over unchanged except where noted under "Changes from the original".

**Character:**
- near-monochrome ink on a warm off-white canvas, with one dark brand colour and one restrained accent;
- hairline structure: 1px lines rather than shadows;
- two typefaces;
- product illustrations on soft stone tiles;
- no gradients, decorative blobs or motion beyond tiny hover transitions.

All styles live in `styles/oc-base.css` (global) and `pages/<page>/<page>.css` (page sections). **Every selector is scoped under `.oc`**, the root class of each custom-code block, and every custom property is prefixed `--oc-`. Native GHL elements are never restyled.

## Colour tokens

Defined on `.oc` in `oc-base.css` §1.

| Token | Value | Use |
|---|---|---|
| `--oc-brand` | `#1f2b22` (theme) | Primary buttons, footer, CTA panel, step numbers |
| `--oc-brand-ink` | auto (`#fff` / `#18191b`) | Text on brand: picked by contrast in `oc-site.js` |
| `--oc-accent` | `#b5e14a` (theme) | Accent buttons on dark panels, selection, confirmation icon |
| `--oc-accent-ink` | auto | Text on accent |
| `--oc-canvas` | `#f6f6f3` (theme) | Page background |
| `--oc-surface` | `#ffffff` | Cards, form card, featured-products band |
| `--oc-surface-2` | `#fafaf8` | Placeholders |
| `--oc-ink` / `--oc-text` | `#18191b` | Headings, body emphasis, selected pills and chips |
| `--oc-text-2` | `#5c5e63` | Body copy |
| `--oc-text-3` | `#66686d` | Meta text, eyebrows, labels (see changes) |
| `--oc-line` | `#e7e7e2` | Hairlines, card borders |
| `--oc-line-strong` | `#d5d5cf` | Control borders, outline buttons |
| `--oc-art-bg` | `#efeee8` | Product image tiles |
| `--oc-pos` / `--oc-pos-soft` | `#2e6b35` / `#e8f3e3` | "Open" badge, "Online" tag |
| `--oc-warn` / `--oc-warn-soft` | `#7a4f00` / `#fbf1dc` | Sample/draft notices |
| `--oc-muted-soft` | `#efefea` | "Closed" badge, tags |

**Theming:** set `OC_CONFIG.theme.{brand, accent, canvas}`. `oc-site.js` writes them as `--oc-theme-*` on `<html>`, and the tokens fall back to the defaults above.

**Contrast:**
- Body and meta text meet WCAG AA (4.5:1) on the canvas, white and stone tiles; axe tests enforce this.
- The automatic ink colour keeps button text legible on any brand or accent colour.

## Typography

- **Body:** Inter Tight (400/500/600). **Display:** Instrument Sans 600, letter-spacing −0.02em. Both load from Google Fonts in the head tracking code.
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
| Meta | 12.5–13.5px | 1.5 |

## Layout and spacing

| Item | Value |
|---|---|
| Container | max 1200px, gutters 20px (phone) / 32px (≥640px) |
| Breakpoints | 640, 768, 900 (header menu), 1024, 1440 |
| Section rhythm | 80px vertical padding. Section heads sit on a hairline with a 200px label column on ≥768px. |
| Radii | controls 10px · cards 20px · large panels 24–28px · pills fully rounded |
| Header | 64px, sticky, translucent canvas with blur |

## Components

Class names are in the CSS and the blocks.

| Component | Classes | Where |
|---|---|---|
| Promo banner | `oc-promo` | Header (config `promo`) |
| Header, nav, mobile menu | `oc-header`, `oc-brand`, `oc-nav`, `oc-menu-btn`, `oc-mobile-nav` | Global |
| Footer | `oc-footer`, `oc-footer__*`, `oc-hours-row` | Global |
| Buttons | `oc-btn` + `--brand` / `--accent` / `--outline` / `--light`, `--lg`, `--block` | Everywhere |
| Links | `oc-arrow-link`, `oc-underline-link`, `oc-text-link`, `oc-back` | Everywhere |
| Eyebrow + index | `oc-eyebrow`, `oc-eyebrow__index` | Section heads |
| Page intro | `oc-intro`, `oc-intro__title`, `oc-intro__body` | Inner pages |
| Section head | `oc-section-head`, `__title`, `__body`, `__action` | Sections |
| Product tile + card | `oc-art`, `oc-product-grid`, `oc-product-card` | Home, Eyewear, Product |
| Hero, stats, hero art | `oc-hero`, `oc-stats`, `oc-hero-art` | Home |
| Service rows | `oc-service-rows` | Home |
| Values grid | `oc-values` | Home |
| Quote cards | `oc-quotes`, `oc-quote` | Home |
| Branch cards / strip | `oc-branch-card`, `oc-branch-strip`, `oc-status` | Home, About |
| CTA panel | `oc-cta` (+ `--single`), `oc-faq-mini` | Home, Services |
| Pills + search | `oc-pills`, `oc-pill`, `oc-search`, `oc-input` | Eyewear |
| Chips, thumbnails, availability | `oc-chips`, `oc-chip`, `oc-thumbs`, `oc-availability` | Product |
| Service cards, price list | `oc-svc-card`, `oc-price-list` | Services |
| Steps and choices | `oc-step`, `oc-choices`, `oc-choice` | Book |
| FAQ list, aside card | `oc-faq__list`, `oc-aside-card` | FAQ |
| Legal layout | `oc-legal`, `oc-legal__toc`, `oc-legal__section` | Privacy, Terms |
| Confirmation card | `oc-confirm` | Booking confirmed, Thank you |
| Embed slot | `oc-embed`, `oc-embed-card` | Contact, Product, Book |
| Placeholder | `oc-placeholder` | Shown instead of an unconfigured GHL form or calendar |
| Notice, tag | `oc-notice`, `oc-tag` (+ `--warn`, `--pos`) | Sample/draft labels, "Online", "Sample" |

## Rules

- Keep blocks inside full-width GHL sections with zero padding. The blocks draw their own spacing and backgrounds.
- One h1 per page, then h2 → h3. Every interactive element is a real `<a>` or `<button>`, with a visible focus ring (2px ink outline).
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
| Native `<select>` styling and form controls removed | Forms are now native GHL forms, styled in GHL's form builder |
| Booking date/time picker replaced by the native GHL calendar; branch and service steps kept | GHL is the system of record for appointments |
| Product inquiry form opens on demand ("Ask about this") instead of always showing | Faster page; the form loads only when needed |
| New: Accessories category, catalogue search, product image thumbnails, variant selection, "Buy online" | Phase 3 requirements |
| New: testimonials section (labelled sample until real), promo banner, confirmation pages | Phase 3 requirements |
| Draft legal notice, privacy section on online forms and bookings, cookies, online purchases | Content now runs through GHL; flagged for legal review |
