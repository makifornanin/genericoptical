# Home — `/`

| | |
|---|---|
| Original source | `src/app/(site)/page.tsx` → copied verbatim to `source/page.tsx` |
| Wrapped by | `src/app/(site)/layout.tsx` (demo banner, header, footer) → `../../components/layout.tsx` |
| Shared components used | `Container`, `Eyebrow`, `SectionHead`, `ProductArt`, `siteButton`, `groupedHours`, `openStatus` (`site-ui.tsx`) |
| Data | `getSite()` → business (`getSiteBusiness`), active branches (`listBranches`), public appointment types (`appointmentTypesFor`); `getShowcase(biz.id)` → catalogue products shown on the website |
| `<title>` | `Lensmere Optical — Eye care & eyewear` (layout default: `name — tagline`) |
| Meta description | `websiteContent.heroBody` → "Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches — with optometrists who take the time to explain your options." |
| Robots | `noindex, nofollow` (demo business) |
| Screenshots | `screenshots/home-desktop.png`, `home-mobile.png`, `home-mobile-menu-open.png` |
| Standalone | `standalone/index.html` |

The files in `source/` are byte-for-byte copies — do not edit them; all commentary lives here.

Rendering: a React **Server Component** wrapped in `<Suspense>`; everything is read from PostgreSQL on each request (`await connection()` in the layout makes the site fully dynamic). Nothing here can be pasted into GHL — use `standalone/index.html` as the visual reference.

## Sections, top to bottom

### 0. Site chrome (every page)
Demo banner (only when `biz.isDemo`), sticky header with logo/name/tagline, main nav (Eyewear, Services, About, FAQ, Contact), "Book an exam" button, mobile hamburger menu, and the brand-coloured footer. Documented in `../../components/COMPONENTS.md` (`layout.tsx`, `site-header.tsx`).

### 1. Hero
- **Purpose:** state the proposition and push to the two primary actions (book, browse).
- **Content:** eyebrow `websiteContent.heroEyebrow` ("Eye care & eyewear"), H1 `heroTitle`, paragraph `heroBody`; buttons "Book an eye exam →" (`/book`, brand lg) and "Browse eyewear" (`/eyewear`, outline lg); a 3-cell stats strip: **Branches** = number of active branches (3), **Frames & eyewear** = number of online products whose category kind is frames or sunglasses (27), **Eye exam** = duration of the first appointment type that requires a practitioner (45 min; falls back to "Services online" + count).
- **Right column:** 3 product illustrations chosen by `pickHero()` from the featured list — one per colourway (black / tortoise / smoke): a wide 16:10 image (Arden 101) and two 4:3 tiles with name and "from ₱…" (Arden Round 33, Brio Kids Sun). Each links to `/eyewear/<id>`.
- **Data source:** Settings → Website (copy), branches table, catalogue (products + variants + categories).
- **Interactions:** links only; image zooms 3% on hover.
- **Responsive:** single column < 1024px (text, then images); 2 columns `1.15fr / 1fr` ≥ 1024px. H1 44px → 64px at ≥ 640px. Image grid gap 12px → 16px.

### 2. "01 Services" — numbered service rows
- **Purpose:** show what can be booked, how long it takes and what it costs.
- **Content:** section head (index "01", eyebrow "Services", title "Care that starts with a proper examination.", body copy, action link "All services →" to `/services`). Then an ordered list, one row per **public** appointment type: number, name, description, clock icon + "N minutes", price (`₱500.00`, "Free" when 0, "Price on request" when null), "Book ↗" link to `/book?type=<id>`.
- **Data source:** `appointment_types` (isPublic, isActive, sortOrder). Demo: Comprehensive eye exam 45 min ₱500; Contact lens fitting 30 min ₱800; Frame & lens consultation 30 min price on request.
- **Responsive:** stacked < 640px; 5-column grid `60px 1fr 140px 140px auto` ≥ 640px. Section is hidden entirely if there are no public types.

### 3. "02 Eyewear" — featured products
- **Purpose:** show the range.
- **Content:** section head ("02", "Eyewear", "Frames chosen for fit, not just fashion.", body, "See all eyewear →"). Grid of 8 product cards: 4:3 illustration on `#efeee8`, name, "Brand · Category", lowest price (no "from" here).
- **Selection logic (`pickFeatured`)**: products with an image, one per frame *shape*, interleaving ~3 frames for every sunglass. Demo result: Arden 101, Arden 204, Arden Round 33, Brio Kids Sun, Halden Aviator RX, Halden Oval, Kiyo Hex, Halden Pilot.
- **Background:** white (`bg-surface`) band.
- **Responsive:** 2 columns < 768px, 4 columns ≥ 768px; names/meta truncate with ellipsis.

### 4. "03 Our approach" — about teaser + values
- **Content:** section head with title `websiteContent.aboutTitle` ("It starts with listening.") and body `aboutBody`; a 4-cell grid of `values[]` (number, title, body) separated by 1px hairlines inside a 20px-radius frame.
- **Responsive:** 1 column → 2 at ≥ 640px → 4 at ≥ 1024px.

### 5. "04 Visit us" — branch cards
- **Content:** title "3 branches, one standard of care." (or "Visit the clinic." for one branch). One card per active branch: name, live status pill ("Open"/"Closed", green/grey), status line from `openStatus()` e.g. "Open now · until 7pm" / "Closed · opens tomorrow 10am" (computed in the business time zone Asia/Manila at request time), address, phone (tel: link), grouped hours ("Mon – Sat 10am – 7pm", "Sun 11am – 5pm"), "Book here" (`/book?branch=<id>`) and an optional "Map" button when the branch has `mapUrl` (none in the demo).
- **Data source:** branches table; branch hours fall back to the business hours.
- **Responsive:** 1 → 2 (≥ 768px) → 3 (≥ 1024px) columns.

### 6. CTA panel + FAQ teaser
- **Content:** brand-coloured rounded (28px) panel. Left: eyebrow "Ready when you are", H2 "Book your next eye exam online.", paragraph, buttons "Book an appointment →" (accent/lime) and "Ask a question" (light outline → `/contact`). Right (only if FAQs exist): eyebrow "Common questions", the first 4 FAQs as native `<details>` accordions (a "+" that rotates to "×"), link "All questions →" (`/faq`).
- **Data source:** `websiteContent.faqs`.
- **Responsive:** stacked < 1024px (FAQ under a hairline); 2 columns `1fr / 1.1fr` ≥ 1024px. Padding 32px → 48px at ≥ 640px. H2 34px → 44px.

### 7. Footer (layout)
See `COMPONENTS.md` → `layout.tsx`. Top margin 96px.

## Notes / quirks
- The stats and featured products change automatically when the catalogue changes; a GHL rebuild must update them by hand.
- `openStatus()` is evaluated on the server per request; with the page cached it could be stale — in GHL it has no native equivalent (see the migration guide).
- Hero tiles always say "from …" even for single-variant products.
