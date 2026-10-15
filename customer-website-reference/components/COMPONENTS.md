# Shared components

Everything in this folder is a **byte-for-byte copy** of the original file (same filename). Do not edit the copies; this document is the commentary. Paths on the left are relative to this folder; the original path is given for each.

These are React/Next.js 16 files (Server Components, a client component, server actions, Drizzle DB calls). None of them can run inside GoHighLevel — the visual equivalents live in `../standalone/` (`site.css` section numbers are given below).

| File here | Original | Kind |
|---|---|---|
| `layout.tsx` | `src/app/(site)/layout.tsx` | Server layout for every public page |
| `site-header.tsx` | `src/app/(site)/site-header.tsx` | Client component (header + mobile menu) |
| `site-ui.tsx` | `src/app/(site)/site-ui.tsx` | Presentational helpers + hours utilities |
| `inquiry-form.tsx` | `src/app/(site)/inquiry-form.tsx` | Client component (contact / product enquiry form) |
| `legal.tsx` | `src/app/(site)/legal.tsx` | Layout for Privacy and Terms |
| `site-data.ts` | `src/app/(site)/site-data.ts` | Server-only data access (DB) |
| `actions.ts` | `src/app/(site)/actions.ts` | Server actions (form posts) |
| `ui/form.tsx` | `src/components/ui/form.tsx` | Dashboard form primitives reused by the site |
| `app/use-action.ts` | `src/components/app/use-action.ts` | Hook that calls a server action |
| `supporting/app/layout.tsx` | `src/app/layout.tsx` | Root layout: fonts, `<html>`, toaster |
| `supporting/app/sitemap.ts` | `src/app/sitemap.ts` | Dynamic sitemap.xml |
| `supporting/app/robots.ts` | `src/app/robots.ts` | robots.txt |
| `supporting/lib/color.ts` | `src/lib/color.ts` | `brandVars()` — brand CSS variables |
| `supporting/lib/types.ts` | `src/lib/types.ts` | `WeekHours`, `WebsiteContent`, `ActionResult` … |
| `supporting/lib/schemas.ts` | `src/lib/schemas.ts` | Zod schemas incl. `publicLeadInput`, `publicAppointmentInput`, `LEAD_INTERESTS` |
| `supporting/lib/format.ts` | `src/lib/format.ts` | `formatter(biz)` — money/date formatting |
| `supporting/lib/dates.ts` | `src/lib/dates.ts` | `formatInZone`, `todayIn` |
| `supporting/lib/money.ts` | `src/lib/money.ts` | `formatMoney` (Intl currency, used by `formatter`) |
| `supporting/lib/cn.ts` | `src/lib/cn.ts` | `cn()` = clsx + tailwind-merge |

Not copied (backend, reused by the staff dashboard and documented in page NOTES instead): `src/server/services/settings.ts` (`getSiteBusiness`, `listBranches`), `src/server/services/appointments.ts` (`appointmentTypesFor`, `availableSlots`, `requestPublicAppointment`), `src/server/services/leads.ts` (`capturePublicLead`), `src/server/db/schema.ts`.

---

## `layout.tsx` — site frame (all public pages)
- `generateMetadata()` — `<title>` default `"{name} — {tagline ?? 'Eye care & eyewear'}"`, template `"%s · {name}"`; description = `websiteContent.heroBody` ?? `description`; `og:site_name`, `og:type=website`; **`robots: noindex, nofollow` when `biz.isDemo`**. If no business exists the title is "Website".
- `SiteFrame` (async Server Component, `await connection()` → rendered per request):
  - No business → centred message "This website isn't set up yet" + "Staff sign in" link.
  - Wrapper `<div style={brandVars(brandColor, accentColor)}>` — this is where the per-business colours are injected as CSS variables (see `../styles/tokens.md`).
  - **Demo banner** (ink background, 12.5px, centred) when `biz.isDemo`: "Demo website. {name} is a fictional business — names, prices and branches are sample data. Open the staff demo" (→ `/login`).
  - `<SiteHeader>`; `<main id="main">`.
  - **Footer** (brand background, brand-ink text, 96px top margin, 56px padding): name (display 26px), tagline (70% opacity), phone (tel:), email (mailto:), "address line 1, city", accent pill "Book an eye exam ↗" (`/book`); up to 3 branch columns (eyebrow name, address, grouped hours); bottom row with footer nav (SITE_NAV + Privacy + Terms) and "© {year} {legalName ?? name}. Staff sign in". Grid: 1 column → `1.1fr 2fr` at ≥ 1024px; branch columns 1 → 2 (≥ 640px) → 3 (≥ 1024px).
- `SiteSkeleton` — Suspense fallback (grey pulse bars).
- Standalone: `site.css` §4–5, repeated header/footer markup in every HTML file.

## `site-header.tsx` — `SiteHeader({ name, logoUrl, tagline })` (client)
- Sticky (`top: 0; z-index: 40`), 64px tall, hairline bottom border, canvas at 90% opacity with 12px backdrop blur.
- Logo: `<img>` when `logoUrl`, else a 32px brand-coloured circle with the first letter. Name in display font 17px; tagline 11.5px grey, hidden below 640px.
- Desktop nav (≥ 768px): pill links from `SITE_NAV`; the active link (pathname equals or starts with the href) gets a white background, inset 1px hairline ring and `aria-current="page"`. Then a brand "Book an exam" button.
- Mobile (< 768px): 40px round menu button (Menu/X icon, `aria-expanded`, `aria-controls="site-mobile-nav"`, label "Open menu"/"Close menu"). The panel lists the links (17px, hairline-separated) and a full-width large "Book an exam" button. State is keyed to the pathname so navigating closes it.
- Standalone: `site.css` §4, `site.js` §1.

## `site-ui.tsx` — helpers
| Export | Props / signature | What it renders / does |
|---|---|---|
| `SITE_NAV` | const | Eyewear `/eyewear`, Services `/services`, About `/about`, FAQ `/faq`, Contact `/contact` |
| `hoursText(day)` | `DayHours` | "10am – 7pm" or "Closed" (12-hour, minutes only when non-zero) |
| `openStatus(hours, timezone, now?)` | `WeekHours, string` | `{ open, label }` — "Open now · until 7pm", "Closed · opens 10am today", "Closed · opens tomorrow 10am", "Closed · opens Monday 10am", "Closed" |
| `groupedHours(hours)` | `WeekHours` | Collapses consecutive equal days: `[{ days: "Mon – Sat", text: "10am – 7pm" }, { days: "Sun", text: "11am – 5pm" }]` |
| `Container` | `children, className?` | `max-width: 1200px`, centred, side padding 20px (32px ≥ 640px) |
| `Eyebrow` | `children, className?` | 12px semibold uppercase, letter-spacing 0.14em, grey `--text-3` |
| `SectionHead` | `index?, eyebrow, title, body?, action?` | Hairline-topped head: grid `200px / 1fr / auto` ≥ 768px; eyebrow with mono index ("01"), H2 30px → 38px display, optional body (16px), optional action (link/button) |
| `PageIntro` | `eyebrow, title, body?, children?` | Page-top section with bottom hairline: eyebrow, H1 40px → 56px (max 820px), body 17px (max 620px) |
| `siteButton(variant, size)` | `"brand" \| "outline" \| "light" \| "accent"`, `"md" \| "lg"` | Returns class names for a pill button: md = 40px tall / 20px padding / 14px; lg = 48px / 24px / 15px. brand = `--brand` bg + `--brand-ink`, hover brightness 110%; accent = `--accent` + `--accent-ink`, hover 95%; outline = white + strong hairline, hover darker border; light = white 25% border on dark, hover white 10% fill |
| `SiteLink` | `href, children, className?` | Underlined link (line-strong decoration, darkens on hover) — not used by any page currently |
| `ProductArt` | `src, alt, className?` | 4:3 box, radius 16px, background `#efeee8`, `<img object-fit: cover>` (lazy), 3% zoom on parent hover; "No image" placeholder |

Standalone: `site.css` §3 (eyebrow, buttons, links), §6 (page intro, section head), §7 (product art/cards); `site.js` §2 reimplements `openStatus`.

## `inquiry-form.tsx` — `InquiryForm` (client)
Props: `branches: {id, name}[]` (required) · `kind?: "contact" | "product_inquiry"` (default contact) · `productName?: string` · `defaultInterest?: LEAD_INTERESTS[number]` (default "other") · `submitLabel?: string` (default "Send message") · `className?`.

Fields (in order): **Full name** (required) · **Email** · **Mobile number** (hint "Email or mobile — whichever you prefer.") · **I'm interested in** (select of `LEAD_INTERESTS` with `LEAD_INTEREST_LABELS`) · **Preferred branch** (select, only when > 1 branch; "No preference" = empty) · **Message** (4 rows; prefilled "I'd like to know more about {productName}." in product mode) · hidden honeypot `website` · checkbox **"You may text me about this enquiry"** (`smsConsent`) · checkbox **"Send me occasional offers and eye-care reminders"** (`marketingConsent`) · note "We use your details only to reply to you. See our privacy notice." · submit (brand lg; "Sending…" while pending).

Submit → `submitInquiryAction({ ...form, kind, productName, preferredBranchId })`. Field errors appear under inputs (red, `role="alert"`); general errors in a red `FormError` box. Success replaces the form with a card: green check icon, "Thanks, {first name}." (or "there"), "We've received your message and a member of our team will get back to you, usually within one business day.", "Send another message" button.

Option values (`src/lib/schemas.ts`): `eye_exam` Eye examination · `prescription_glasses` Prescription glasses · `contact_lenses` Contact lenses · `sunglasses` Sunglasses · `frames` Frames only · `repair` Repair / adjustment · `other` Other.

Standalone: `site.css` §12; the form markup appears in `contact.html` and `product-detail.html`.

## `legal.tsx` — `LegalPage({ eyebrow, title, intro, sections })`
`sections: { heading: string; body: ReactNode }[]`. Grid `240px / 1fr` ≥ 1024px: sticky "On this page" ordered list of anchors (`#s1`…) on the left (hidden on smaller screens); article (max 700px) with eyebrow, H1 40px → 50px, intro 16.5px, then numbered sections (mono "01" + H2 22px, body 15.5px, disc bullets). Comment in the file: the text is a plain-language starting point that must be legally reviewed (e.g. Philippine Data Privacy Act of 2012). Standalone: `site.css` §17.

## `site-data.ts` — data access (server-only)
- `getSite()` (React `cache`, once per request) → `{ biz, branches, types }`: `getSiteBusiness()` (the business named by `SITE_BUSINESS_SLUG`, else the first non-demo business, else the demo), `listBranches(biz.id, { activeOnly: true })`, `appointmentTypesFor(db, biz.id, publicOnly=true)`.
- `getShowcase(businessId)` → products where `showOnWebsite` and active and not archived, joined to category and active variants; returns `{ id, name, brand, description, imageUrl, category, categoryKind, shape, minPrice, options[] }` (options = variant labels other than "Default").
- GHL equivalent: none — content must be entered into GHL (or synced via the GHL API).

## `actions.ts` — server actions ("use server")
| Action | Input | Does | Limits |
|---|---|---|---|
| `submitInquiryAction(input)` | `publicLeadInput` | `capturePublicLead()` → new Lead or activity on a recent open lead | 8 per IP / 10 min (in-memory) |
| `publicSlotsAction({ branchId, appointmentTypeId, date })` | | `availableSlots()` → `["12:30", "13:00", …]` (read-only) | date must be `YYYY-MM-DD` |
| `bookAppointmentAction(input)` | `publicAppointmentInput` | `requestPublicAppointment()` → appointment (status scheduled, source website) + lead; returns `{ startsAt, typeName, branchName }` | 5 per IP / 10 min |

All return `ActionResult` (`{ ok: true, data } | { ok: false, error, fieldErrors }`) via `toResult`. GHL equivalents: GHL Forms (inquiry) and GHL Calendars (slots + booking) — see `../ghl-migration-guide.md`.

## `ui/form.tsx` — form primitives (shared with the dashboard)
`Input`, `Textarea`, `Select` (36px tall controls, radius 10px, 1px `--line-strong` border, 13.5px text, focus = ink border + 2px ink/10% ring, invalid = red border; Select intends a grey chevron via a Tailwind arbitrary `bg-[url(...)]` value — **in the captured screenshots no chevron is visible, i.e. that arbitrary background does not appear to be generated**; the standalone CSS draws the intended chevron), `Field` (label 12.5px medium grey, red "*" when required, error text red 12px or hint grey 12px), `TextField`, `SelectField`, `TextareaField` (auto-linked label/id, `aria-invalid`), `Checkbox` (16px box with ink accent colour, 13.5px medium label, optional description), `MoneyInput` (dashboard only), `FormError` (red-tinted box, `role="alert"`).

## `app/use-action.ts` — `useAction(action, { success?, onSuccess?, silent? })`
Wraps a server action in `useTransition`; returns `{ run, pending, error, fieldErrors, fe(key), reset }`. Network failure → "Couldn't reach the server. Check your connection and try again." The site passes `silent: true` (no toasts; errors are shown inline).

## `supporting/app/layout.tsx` — root layout
Loads **Inter Tight** (`--font-inter-tight`, variable weight, latin, swap) and **Instrument Sans** (`--font-instrument`, weights 500/600/700) via `next/font/google`; `<html lang="en" class="… h-full antialiased">`; `themeColor #18191b`; Sonner `<Toaster>` (not used by the public site because its forms are silent). Default metadata "Optical business platform" is overridden by the site layout.

## `supporting/app/sitemap.ts` / `robots.ts`
- `sitemap.xml`: per request; **empty for demo businesses**; otherwise `/`, `/eyewear`, `/services`, `/book`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms` + one URL per online product (`/eyewear/<id>`), all `changeFrequency: weekly`, based on `APP_URL`.
- `robots.txt`: allow `/`, disallow `/app/`, `/api/`, `/print/`, `/login`, `/forgot-password`, `/reset-password`; points at `{APP_URL}/sitemap.xml`.
