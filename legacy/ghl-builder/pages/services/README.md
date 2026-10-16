# Services — `/services`

- **SEO title:** Services · {Business}
- **SEO description:** Eye examinations, contact lens consultations, prescription eyewear, lens replacement and frame repairs.
- **Reference:** `screenshots/desktop/services.png`

## Sections

| # | Paste | What it is | Content |
|---|---|---|---|
| — | OC Header | | |
| 1 | `blocks/01-intro.html` | Page intro | Static |
| 2 | `blocks/02-appointments.html` | "01 Book online": a card per bookable service with price, duration and **Book this** | `OC_CONFIG.services`: `enabled` + `bookable: true` |
| 3 | `blocks/03-in-branch.html` | "02 In branch": price list of walk-in services | `services` with `bookable: false` (hidden if none) |
| 4 | `blocks/04-help.html` | "Start with an eye exam" call to action | Static |
| — | `99-page-script.html` | `services.js` | |
| — | OC Footer | | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## Configuring services

The six sample services (all configurable):
- comprehensive eye exam;
- contact lens consultation;
- frame & lens consultation;
- prescription eyewear;
- lens replacement;
- frame adjustment & repairs.

**Per service:**
- **Service not offered:** set `enabled: false`. It disappears here, on the home page and on the Book page.
- **Online booking:** `bookable: true` requires a GHL calendar for it (branch service-menu calendar or `services[].calendars`). "Book this" opens `/book?service=<id>`.
- **Price:** `price` is a number (formatted in the business currency). Or set `price: null` with `priceLabel` (e.g. "From ₱1,200", "Free", "Insurance accepted").
- **Keep in step with GHL:** durations and prices shown here must match the GHL calendar settings.
