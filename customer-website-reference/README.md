# Customer website — reference archive

**Captured:** 2026-10-15, from the running dev server (http://localhost:3000) of this repository, using the demo business **Lensmere Optical** (fictional — every name, address, price and branch is sample data).

## What this is
A self-contained snapshot of the public, customer-facing website of the optical-business platform (`src/app/(site)/` in the Next.js 16 app), made so the site can be rebuilt in the **GoHighLevel (GHL) website builder** and the public routes can then be removed from the app.

It contains, for each of the 10 pages: verbatim source copies, a section-by-section description, the rendered copy, full-page screenshots at 1440px and 390px, and a hand-written static HTML/CSS reference that reproduces the look without any framework.

> **Warning — the Next.js source is reference only.** The `.tsx`/`.ts` files are React Server Components, client components, Next.js server actions and Drizzle/PostgreSQL queries. They cannot be pasted into GHL and will not run outside the app. Use `standalone/` for anything you want to paste into a GHL custom-code element, and `ghl-migration-guide.md` for what to build natively in GHL (forms, calendars, products).

## How it is organised

```
customer-website-reference/
├── README.md                 ← this file
├── MANIFEST.md               ← page → route → source → components → data → screenshots → standalone
├── ghl-migration-guide.md    ← per-section GHL classification, form fields, calendars, products, SEO, checklist
├── pages/<page>/             ← home, about, products, product-detail, services, booking, contact, faq, privacy, terms
│   ├── source/               ← byte-for-byte copies of the page file(s) (original filenames, never edited)
│   ├── NOTES.md              ← each section top-to-bottom: purpose, content, data source, interactions, responsive
│   └── content.md            ← visible copy as rendered for the demo business
├── components/               ← verbatim shared site files + the dashboard primitives they import
│   ├── COMPONENTS.md         ← what each component does and its props
│   ├── layout.tsx, site-header.tsx, site-ui.tsx, inquiry-form.tsx, legal.tsx, site-data.ts, actions.ts
│   ├── ui/form.tsx, app/use-action.ts
│   └── supporting/           ← root layout, sitemap, robots and src/lib helpers (color, types, schemas, format, dates, money, cn)
├── styles/
│   ├── globals.css           ← verbatim copy (Tailwind v4 tokens)
│   └── tokens.md             ← every colour / radius / shadow / font token, brand variables, type scale
├── assets/                   ← favicon.ico + the 21 product SVGs actually shown (assets/products/*.svg)
├── screenshots/              ← originals: <page>-desktop.png (1440px) / <page>-mobile.png (390px) + states
│   └── standalone/           ← the same views rendered from standalone/*.html (verification)
└── standalone/               ← static HTML reference: index, about, products, product-detail, services,
                                 booking, contact, faq, privacy, terms (.html) + site.css + site.js
```

Page folder ↔ route: `home` `/` · `about` `/about` · `products` `/eyewear` · `product-detail` `/eyewear/[id]` (captured with the first product, Arden 101) · `services` `/services` · `booking` `/book` · `contact` `/contact` · `faq` `/faq` · `privacy` `/privacy` · `terms` `/terms`.

Extra screenshots: `home-mobile-menu-open.png` (mobile menu open), `booking-slots-selected-*.png` (branch + service + date chosen, time slots visible), `booking-slots-selected-*-overflow.png` (the original's horizontal-overflow bug, see `pages/booking/NOTES.md`). Form success states were not captured because no forms were submitted.

## Viewing the standalone pages
Open `standalone/index.html` by double-clicking it — no server or build step is needed; all pages link to each other and load images from `../assets/`. An internet connection is only needed for the Google Fonts (Inter Tight, Instrument Sans); without it the pages fall back to system fonts.

- `site.css` is plain CSS with custom properties for every token and the brand colours (no Tailwind). Sections are numbered (§1 tokens … §18) and referenced from the docs.
- `site.js` is optional and tiny: mobile menu toggle, live open/closed badge, `?category=` filter on the products page, selection toggling on the booking mock, and a guard that stops the static forms from submitting. FAQs use native `<details>`.
- HTML comments mark every block that is **dynamic** in the original (products, prices, branches, hours, services, FAQs, copy from Settings) and name the GHL feature that should replace it.
- The booking page is a **static, clearly labelled mock** of the date/time picker — replace it with a GHL calendar widget.
- Forms are visual only (submitting shows a notice) — replace them with GHL forms.

Fidelity: every standalone page except booking renders at exactly the same full-page height as the original at both widths; differences are limited to the booking mock (intentional label, selected state, and a fix for the original's overflow bug), the live open/closed badge (reflects the time you open it), and the `<select>` chevron (intended by the source, not visible in the original screenshots).

## Notes
- Demo content must be replaced before publishing; the demo site is `noindex, nofollow` and its sitemap is empty by design.
- Captures were made with Playwright using GET requests only, plus the read-only time-slot lookup server action on the booking page (needed to show slots). "Request appointment", "Send message" and "Ask about this" were never submitted.
- Nothing outside this folder was modified.
