# About — `/about`

| | |
|---|---|
| Original source | `src/app/(site)/about/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `Container`, `Eyebrow`, `SectionHead`, `siteButton`, `groupedHours` |
| Data | `getSite()` → business (`websiteContent.aboutTitle`, `aboutBody`, `values`, business hours) and active branches |
| `<title>` | `About us · Lensmere Optical` |
| Meta description | inherited from layout (heroBody) |
| Screenshots | `screenshots/about-desktop.png`, `about-mobile.png` |
| Standalone | `standalone/about.html` |

Server Component inside `<Suspense>` (fallback: a 70vh blank block). Source copies are verbatim; commentary is here.

## Sections, top to bottom

### 1. About hero (two columns)
- **Purpose:** the brand story.
- **Content:** eyebrow "About {business name}", H1 = `aboutTitle` ("It starts with listening.", falls back to "About {name}"); right column = `aboutBody` (falls back to `biz.description`) split into paragraphs on blank lines — the demo has one paragraph.
- **Responsive:** stacked < 1024px; `1fr / 1.1fr` with 64px gap ≥ 1024px, copy column pushed down 48px. H1 40px → 56px at ≥ 640px. Bottom hairline.

### 2. "01 What to expect — How we work"
- **Content:** section head; list of `values[]` — each item is a hairline-topped row with a mono number (01–04), H3 title (21px display) and body (15px).
- **Responsive:** 1 column → 2 columns at ≥ 640px. Hidden when there are no values.

### 3. "02 Where to find us — Our branches"
- **Content:** section head with action button "Book a visit" (`/book`, brand). A framed strip of branch cells (name, "address line 1, line 2, city", grouped hours).
- **Data source:** active branches; hours fall back to business hours.
- **Responsive:** stacked < 768px; 3 columns ≥ 768px (cells separated by 1px hairlines).

Followed by the footer (layout).
