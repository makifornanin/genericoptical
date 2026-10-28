# Services — `/services`

| | |
|---|---|
| Original source | `src/app/(site)/services/page.tsx` → `source/page.tsx` (verbatim). Contains a page-local `PriceList` component. |
| Shared components used | `Container`, `PageIntro`, `SectionHead`, `siteButton` |
| Data | `getSite()` → public appointment types; `getShowcase(biz.id)` filtered to category kinds `rx_lenses` (lens price list) and `services` (in-branch services price list) |
| `<title>` | `Services · Lensmere Optical` |
| Meta description | "Eye examinations, contact lens fittings, eyewear fitting and aftercare." |
| Screenshots | `screenshots/services-desktop.png`, `services-mobile.png` |
| Standalone | `standalone/services.html` |

## Sections, top to bottom

### 1. Page intro (static)
Eyebrow "Services", H1 "Thorough eye care, explained clearly.", body "From comprehensive examinations to the final fitting of your glasses, here's what we offer and what it costs."

### 2. "01 Book online — Appointments"
- **Content:** section head (body "Bookable online at any branch. Each slot is reserved for you and an optometrist."), then one white card per public appointment type: H3 name (22px display), price top-right (display 18px; blank when no price, "Free" when 0), clock + "N minutes", description, button "Book this ↗" → `/book?type=<id>` (preselects the service on the booking page).
- **Data source:** `appointment_types` (public, active). Demo: Comprehensive eye exam (₱500.00, 45 min), Contact lens fitting (₱800.00, 30 min), Frame & lens consultation (no price, 30 min).
- **Responsive:** 1 column < 768px, 2 columns ≥ 768px; cards in a row share equal height, the button sticks to the bottom.

### 3. "02 Lenses — Prescription lenses" (conditional, NOT rendered in the demo)
Price list of catalogue products with category kind `rx_lenses` that are ticked "show on website": name, description, price ("from" when several variants). Body: "Made to your prescription by our partner laboratory. Your optician will recommend options after your exam." The demo catalogue has such products but none are published to the website, so this section is absent from the screenshots.

### 4. "02/03 In branch — Fitting, repairs and aftercare" (conditional, NOT rendered in the demo)
Same `PriceList` for category kind `services` (price or "Free"). Index is "03" when the lens list is present, otherwise "02".

`PriceList` layout: hairline-separated rows; name 15.5px medium, description 13.5px, price right-aligned at ≥ 640px (stacked below on mobile). The standalone page keeps a hidden example of this markup for reference.
