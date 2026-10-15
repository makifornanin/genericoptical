# Privacy — `/privacy`

| | |
|---|---|
| Original source | `src/app/(site)/privacy/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `LegalPage` (`legal.tsx`) → `Container`, `Eyebrow` |
| Data | `getSite()` → `biz.legalName` (else name), `websiteContent.privacyContactEmail` (else `biz.email`, else "our branches") |
| `<title>` | `Privacy notice · Lensmere Optical` |
| Meta description | inherited from the layout (heroBody) |
| Screenshots | `screenshots/privacy-desktop.png`, `privacy-mobile.png` |
| Standalone | `standalone/privacy.html` |

The page only supplies copy; layout comes from `LegalPage` (see `../../components/COMPONENTS.md`). `legal.tsx` carries the note: *plain-language starting point; businesses must have these reviewed for their jurisdiction (for example the Philippine Data Privacy Act of 2012) before going live.*

## Sections, top to bottom
1. **"On this page" list** (left, 240px, desktop ≥ 1024px only, sticky at 96px from the top): anchor links `#s1`…`#s5` to the section headings.
2. **Article** (max 700px): eyebrow "Privacy", H1 "Privacy notice" (40px → 50px), intro paragraph with the legal name.
3. **Five numbered sections** (mono "01"–"05" + H2 22px): What we collect (bullets), Why we use it (bullets), Who can see it, How long we keep it, Your rights (privacy email as a mailto link). Bullets: disc, 20px indent, 6px apart. Sections have `scroll-margin-top: 96px` so anchors clear the sticky header.

Responsive: below 1024px the TOC is hidden and the article fills the width.
