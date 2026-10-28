# Products (eyewear listing) — `/eyewear`

| | |
|---|---|
| Original source | `src/app/(site)/eyewear/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `Container`, `PageIntro`, `ProductArt` |
| Data | `getSite()` (business currency/locale/tax name) + `getShowcase(biz.id)` — products joined to categories and variants where `products.showOnWebsite`, active, not archived, variant active; ordered by category sort order, product name, variant sort order. One entry per product with `minPrice` (lowest variant) and `options` (variant labels other than "Default"). |
| Query string | `?category=<category name>` filters the grid (server-side). Unknown values show everything. |
| `<title>` | `Eyewear · Lensmere Optical` |
| Meta description | "Prescription frames, sunglasses, contact lenses and eye-care essentials." |
| Screenshots | `screenshots/products-desktop.png`, `products-mobile.png` |
| Standalone | `standalone/products.html` (category filter reimplemented in `site.js` via `?category=`) |

## Sections, top to bottom

### 1. Page intro (static)
Eyebrow "Eyewear", H1 "Frames, sunglasses and lenses.", body "Browse what we carry, then try it on in branch. Every pair is fitted and adjusted by our opticians." — `PageIntro`; H1 40px → 56px at ≥ 640px; 56px/80px vertical padding; bottom hairline.

### 2. Category pills
- **Content:** "Everything" + one pill per category that has online products, each with a count (demo: Everything 32, Frames 20, Sunglasses 7, Contact lenses 5).
- **Interaction:** links to `/eyewear?category=…`; the active pill is solid ink (`#18191b`) with white text, others white with a strong hairline; `aria-current="page"` on the active one.
- **Responsive:** single row that scrolls horizontally if it doesn't fit.

### 3. Product grid
- **Content per card:** 4:3 SVG illustration on `#efeee8` (radius 16px), name (underlines on hover), "Brand · Category", price — "from ₱X" when the product has more than one variant, plus a line "N options"; single-variant products show just the price.
- **Data source:** catalogue tables (see above). 32 products in the demo (full list in `content.md`). Each card links to `/eyewear/<uuid>`.
- **Empty state:** "Nothing in this category is listed online yet — ask us in branch."
- **Responsive:** 2 columns < 768px, 3 columns 768–1023px, 4 columns ≥ 1024px; text truncates with ellipsis.

### 4. Price footnote
"Prices include {taxName} where applicable. …" — tax name is dynamic ("VAT").

## Notes
- Prices are formatted by `formatter(biz).money()` → `Intl.NumberFormat("en-PH", { currency: "PHP" })` → "₱2,950.00".
- Category kinds `services` and `rx_lenses` would also appear here if any such product were ticked "show on website" (none are in the demo).
