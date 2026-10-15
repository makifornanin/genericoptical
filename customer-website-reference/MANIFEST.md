# Manifest

All archive paths are relative to `customer-website-reference/`. Original paths (`src/…`, `public/…`) are relative to the repository root. Every file under `source/` and `components/` is a byte-for-byte copy of the original.

## Pages

| Page | Route | Original source file(s) → archive copy | Page-specific components | Shared components | Data dependencies (DB service / server action) | Screenshot files | Standalone file |
|---|---|---|---|---|---|---|---|
| Home | `/` | `src/app/(site)/page.tsx` → `pages/home/source/page.tsx` | `pickFeatured()`, `pickHero()` (in the page file) | `components/layout.tsx`, `components/site-header.tsx`, `components/site-ui.tsx` (`Container`, `Eyebrow`, `SectionHead`, `ProductArt`, `siteButton`, `groupedHours`, `openStatus`) | `getSite()` → `getSiteBusiness`, `listBranches`, `appointmentTypesFor`; `getShowcase()` (products/variants/categories) — `components/site-data.ts` | `screenshots/home-desktop.png`, `screenshots/home-mobile.png`, `screenshots/home-mobile-menu-open.png` | `standalone/index.html` |
| About | `/about` | `src/app/(site)/about/page.tsx` → `pages/about/source/page.tsx` | — | `components/site-ui.tsx` (`Container`, `Eyebrow`, `SectionHead`, `siteButton`, `groupedHours`) | `getSite()` → `getSiteBusiness` (websiteContent), `listBranches` | `screenshots/about-desktop.png`, `screenshots/about-mobile.png` | `standalone/about.html` |
| Products (eyewear listing) | `/eyewear` (`?category=`) | `src/app/(site)/eyewear/page.tsx` → `pages/products/source/page.tsx` | `Catalogue` (in the page file) | `components/site-ui.tsx` (`Container`, `PageIntro`, `ProductArt`) | `getSite()` → `getSiteBusiness`; `getShowcase()` | `screenshots/products-desktop.png`, `screenshots/products-mobile.png` | `standalone/products.html` |
| Product detail | `/eyewear/[id]` (captured: Arden 101) | `src/app/(site)/eyewear/[id]/page.tsx` → `pages/product-detail/source/page.tsx` | `findProduct()`, `generateMetadata()` (in the page file) | `components/site-ui.tsx` (`Container`, `Eyebrow`, `ProductArt`), `components/inquiry-form.tsx`, `components/ui/form.tsx`, `components/app/use-action.ts` | `getSite()`, `getShowcase()`; action `submitInquiryAction` → `capturePublicLead` (`components/actions.ts`) | `screenshots/product-detail-desktop.png`, `screenshots/product-detail-mobile.png` | `standalone/product-detail.html` |
| Services | `/services` | `src/app/(site)/services/page.tsx` → `pages/services/source/page.tsx` | `PriceList` (in the page file) | `components/site-ui.tsx` (`Container`, `PageIntro`, `SectionHead`, `siteButton`) | `getSite()` → `appointmentTypesFor`; `getShowcase()` (kinds `rx_lenses`, `services`) | `screenshots/services-desktop.png`, `screenshots/services-mobile.png` | `standalone/services.html` |
| Booking | `/book` (`?branch=`, `?type=`) | `src/app/(site)/book/page.tsx` → `pages/booking/source/page.tsx`; `src/app/(site)/book/booking-form.tsx` → `pages/booking/source/booking-form.tsx` | `BookingForm`, `Step`, `Choice` (booking-form.tsx) | `components/site-ui.tsx` (`Container`, `Eyebrow`, `groupedHours`, `siteButton`), `components/ui/form.tsx`, `components/app/use-action.ts` | `getSite()` → `listBranches`, `appointmentTypesFor`; actions `publicSlotsAction` → `availableSlots`, `bookAppointmentAction` → `requestPublicAppointment` | `screenshots/booking-desktop.png`, `screenshots/booking-mobile.png`, `screenshots/booking-slots-selected-desktop.png`, `screenshots/booking-slots-selected-mobile.png`, `screenshots/booking-slots-selected-desktop-overflow.png`, `screenshots/booking-slots-selected-mobile-overflow.png` | `standalone/booking.html` |
| Contact | `/contact` | `src/app/(site)/contact/page.tsx` → `pages/contact/source/page.tsx` | — | `components/site-ui.tsx` (`Container`, `Eyebrow`, `PageIntro`), `components/inquiry-form.tsx`, `components/ui/form.tsx`, `components/app/use-action.ts` | `getSite()` → `getSiteBusiness`, `listBranches`; action `submitInquiryAction` → `capturePublicLead` | `screenshots/contact-desktop.png`, `screenshots/contact-mobile.png` | `standalone/contact.html` |
| FAQ | `/faq` | `src/app/(site)/faq/page.tsx` → `pages/faq/source/page.tsx` | FAQPage JSON-LD (in the page file) | `components/site-ui.tsx` (`Container`, `PageIntro`, `siteButton`) | `getSite()` → `getSiteBusiness` (websiteContent.faqs) | `screenshots/faq-desktop.png`, `screenshots/faq-mobile.png` | `standalone/faq.html` |
| Privacy | `/privacy` | `src/app/(site)/privacy/page.tsx` → `pages/privacy/source/page.tsx` | — | `components/legal.tsx` (`LegalPage`), `components/site-ui.tsx` | `getSite()` → `getSiteBusiness` (legalName, privacyContactEmail, email) | `screenshots/privacy-desktop.png`, `screenshots/privacy-mobile.png` | `standalone/privacy.html` |
| Terms | `/terms` | `src/app/(site)/terms/page.tsx` → `pages/terms/source/page.tsx` | — | `components/legal.tsx` (`LegalPage`), `components/site-ui.tsx` | `getSite()` → `getSiteBusiness` (legalName, currency, pricesIncludeTax, taxName, email, phone) | `screenshots/terms-desktop.png`, `screenshots/terms-mobile.png` | `standalone/terms.html` |

Each page folder also contains NOTES.md (section-by-section description) and content.md (visible copy):
`pages/home/NOTES.md`, `pages/home/content.md`, `pages/about/NOTES.md`, `pages/about/content.md`, `pages/products/NOTES.md`, `pages/products/content.md`, `pages/product-detail/NOTES.md`, `pages/product-detail/content.md`, `pages/services/NOTES.md`, `pages/services/content.md`, `pages/booking/NOTES.md`, `pages/booking/content.md`, `pages/contact/NOTES.md`, `pages/contact/content.md`, `pages/faq/NOTES.md`, `pages/faq/content.md`, `pages/privacy/NOTES.md`, `pages/privacy/content.md`, `pages/terms/NOTES.md`, `pages/terms/content.md`.

## Shared components and supporting code (verbatim copies)

| Archive copy | Original |
|---|---|
| `components/layout.tsx` | `src/app/(site)/layout.tsx` |
| `components/site-header.tsx` | `src/app/(site)/site-header.tsx` |
| `components/site-ui.tsx` | `src/app/(site)/site-ui.tsx` |
| `components/inquiry-form.tsx` | `src/app/(site)/inquiry-form.tsx` |
| `components/legal.tsx` | `src/app/(site)/legal.tsx` |
| `components/site-data.ts` | `src/app/(site)/site-data.ts` |
| `components/actions.ts` | `src/app/(site)/actions.ts` |
| `components/ui/form.tsx` | `src/components/ui/form.tsx` |
| `components/app/use-action.ts` | `src/components/app/use-action.ts` |
| `components/supporting/app/layout.tsx` | `src/app/layout.tsx` |
| `components/supporting/app/sitemap.ts` | `src/app/sitemap.ts` |
| `components/supporting/app/robots.ts` | `src/app/robots.ts` |
| `components/supporting/lib/color.ts` | `src/lib/color.ts` |
| `components/supporting/lib/types.ts` | `src/lib/types.ts` |
| `components/supporting/lib/schemas.ts` | `src/lib/schemas.ts` |
| `components/supporting/lib/format.ts` | `src/lib/format.ts` |
| `components/supporting/lib/dates.ts` | `src/lib/dates.ts` |
| `components/supporting/lib/money.ts` | `src/lib/money.ts` |
| `components/supporting/lib/cn.ts` | `src/lib/cn.ts` |
| `styles/globals.css` | `src/app/globals.css` |

Documentation: `components/COMPONENTS.md`, `styles/tokens.md`.

Backend services referenced but not copied (they stay in the app; behaviour documented in the page NOTES): `src/server/services/settings.ts` (`getSiteBusiness`, `listBranches`), `src/server/services/appointments.ts` (`appointmentTypesFor`, `availableSlots`, `requestPublicAppointment`), `src/server/services/leads.ts` (`capturePublicLead`).

## Assets (verbatim copies)

| Archive copy | Original | Used by |
|---|---|---|
| `assets/favicon.ico` | `src/app/favicon.ico` | all pages |
| `assets/products/contact-box.svg` | `public/products/contact-box.svg` | 5 contact-lens products |
| `assets/products/frame-aviator-gold.svg` | `public/products/frame-aviator-gold.svg` | Halden Aviator RX |
| `assets/products/frame-browline-black.svg` | `public/products/frame-browline-black.svg` | Mesa Classic |
| `assets/products/frame-cateye-black.svg` | `public/products/frame-cateye-black.svg` | Mesa Cat 9 |
| `assets/products/frame-cateye-gold.svg` | `public/products/frame-cateye-gold.svg` | Solenne Muse |
| `assets/products/frame-hexagon-gold.svg` | `public/products/frame-hexagon-gold.svg` | Kiyo Hex |
| `assets/products/frame-oval-crystal.svg` | `public/products/frame-oval-crystal.svg` | Vela Air |
| `assets/products/frame-oval-gold.svg` | `public/products/frame-oval-gold.svg` | Halden Oval |
| `assets/products/frame-oval-tortoise.svg` | `public/products/frame-oval-tortoise.svg` | Halden Sable |
| `assets/products/frame-rectangle-black.svg` | `public/products/frame-rectangle-black.svg` | Arden 101, Arden Everyday, Kiyo Slim, Kiyo Titan |
| `assets/products/frame-rectangle-crystal.svg` | `public/products/frame-rectangle-crystal.svg` | Brio Junior |
| `assets/products/frame-round-crystal.svg` | `public/products/frame-round-crystal.svg` | Brio Flex Kids |
| `assets/products/frame-round-gold.svg` | `public/products/frame-round-gold.svg` | Halden Wire |
| `assets/products/frame-round-tortoise.svg` | `public/products/frame-round-tortoise.svg` | Arden Round 33, Solenne Atelier |
| `assets/products/frame-square-black.svg` | `public/products/frame-square-black.svg` | Arden 204, Mesa Studio, Vela Square Pro |
| `assets/products/sun-aviator-brown.svg` | `public/products/sun-aviator-brown.svg` | Halden Pilot |
| `assets/products/sun-aviator-green.svg` | `public/products/sun-aviator-green.svg` | Solenne Riviera |
| `assets/products/sun-cateye-smoke.svg` | `public/products/sun-cateye-smoke.svg` | Mesa Cat Sun |
| `assets/products/sun-round-brown.svg` | `public/products/sun-round-brown.svg` | Vela Drift |
| `assets/products/sun-round-smoke.svg` | `public/products/sun-round-smoke.svg` | Brio Kids Sun |
| `assets/products/sun-square-smoke.svg` | `public/products/sun-square-smoke.svg` | Kiyo Sport Polarised, Mesa Coast |

The other 30 SVGs in `public/products/` (other colourways, rx-lens, service-exam, accessories) are not shown on the website for the demo data and were not copied.

## Standalone reference

`standalone/index.html`, `standalone/about.html`, `standalone/products.html`, `standalone/product-detail.html`, `standalone/services.html`, `standalone/booking.html`, `standalone/contact.html`, `standalone/faq.html`, `standalone/privacy.html`, `standalone/terms.html`, `standalone/site.css`, `standalone/site.js`.

Standalone screenshots (file:// renders used for verification): `screenshots/standalone/home-desktop.png`, `screenshots/standalone/home-mobile.png`, `screenshots/standalone/home-mobile-menu-open.png`, `screenshots/standalone/about-desktop.png`, `screenshots/standalone/about-mobile.png`, `screenshots/standalone/products-desktop.png`, `screenshots/standalone/products-mobile.png`, `screenshots/standalone/product-detail-desktop.png`, `screenshots/standalone/product-detail-mobile.png`, `screenshots/standalone/services-desktop.png`, `screenshots/standalone/services-mobile.png`, `screenshots/standalone/booking-desktop.png`, `screenshots/standalone/booking-mobile.png`, `screenshots/standalone/contact-desktop.png`, `screenshots/standalone/contact-mobile.png`, `screenshots/standalone/faq-desktop.png`, `screenshots/standalone/faq-mobile.png`, `screenshots/standalone/privacy-desktop.png`, `screenshots/standalone/privacy-mobile.png`, `screenshots/standalone/terms-desktop.png`, `screenshots/standalone/terms-mobile.png`.

## Top-level documents

`README.md`, `MANIFEST.md`, `ghl-migration-guide.md`.
