# Terms — `/terms`

| | |
|---|---|
| Original source | `src/app/(site)/terms/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `LegalPage` (`legal.tsx`) → `Container`, `Eyebrow` |
| Data | `getSite()` → `biz.legalName`, `biz.currency` ("PHP"), `biz.pricesIncludeTax` (true → "include VAT", false → "exclude VAT"), `biz.taxName`, `biz.email`, `biz.phone` |
| `<title>` | `Terms of service · Lensmere Optical` |
| Meta description | inherited from the layout (heroBody) |
| Screenshots | `screenshots/terms-desktop.png`, `terms-mobile.png` |
| Standalone | `standalone/terms.html` |

Same layout as Privacy (see `../privacy/NOTES.md` and `LegalPage` in `../../components/COMPONENTS.md`): sticky "On this page" list on desktop + article with eyebrow "Terms", H1 "Terms of service", intro, and six numbered sections — Appointments, Prices, Orders and deposits, Returns, refunds and warranty, Payments, Contact. The Contact sentence is assembled from whichever of email/phone exist.

Legal review note from `legal.tsx` applies here too.
