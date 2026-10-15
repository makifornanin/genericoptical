# Design tokens

Source of truth: `globals.css` in this folder (verbatim copy of `src/app/globals.css`, Tailwind v4: `@import "tailwindcss"` + `:root` variables + `@theme inline` mapping them to utility names such as `bg-brand`, `text-text-2`, `border-line`). The plain-CSS equivalent with the same variable names is `../standalone/site.css` §1.

## Colours — neutrals and states (`:root`)

| Token | Value | Tailwind name | Used on the site for |
|---|---|---|---|
| `--ink` | `#18191b` | `ink` | Demo banner background, active category pill, selected date/time buttons, focus ring, checkbox accent |
| `--ink-2` | `#26282b` | `ink-2` | (dashboard) |
| `--ink-3` | `#3a3d41` | `ink-3` | (dashboard) |
| `--canvas` | `#f6f6f3` | `canvas` | Page background; header at 90% opacity (`rgb(246 246 243 / .9)`) |
| `--surface` | `#ffffff` | `surface` | Cards, form card, inputs, "02 Eyewear" band, active nav pill |
| `--surface-2` | `#fafaf8` | `surface-2` | Disabled inputs |
| `--line` | `#e7e7e2` | `line` | Hairlines, card borders, grid gaps |
| `--line-strong` | `#d5d5cf` | `line-strong` | Input/outline-button borders, chips, underline decoration |
| `--text` | `#18191b` | `text` | Primary text |
| `--text-2` | `#5c5e63` | `text-2` | Body copy, secondary text, nav links |
| `--text-3` | `#86888d` | `text-3` | Eyebrows, meta, hints, icons |
| `--accent-soft` | `#eef7d6` | `accent-soft` | (dashboard) |
| `--pos` | `#2e6b35` | `pos` | "Open" badge text/dot, success icons |
| `--pos-soft` | `#e8f3e3` | `pos-soft` | "Open" badge background |
| `--warn` | `#8a5a00` | `warn` | (dashboard; standalone mock labels) |
| `--warn-soft` | `#fbf1dc` | `warn-soft` | (dashboard; standalone mock labels) |
| `--neg` | `#b42318` | `neg` | Required "*", field errors, slot error text |
| `--neg-soft` | `#fdecea` | `neg-soft` | `FormError` box background |
| `--info` / `--info-soft` | `#4d3fb0` / `#efedfb` | `info` | (dashboard) |
| `--muted-soft` | `#efefea` | `muted-soft` | "Closed" badge, inactive step number, skeletons |
| `--series-1…4`, `--series-muted` | `#4d7a2e`, `#3f74c4`, `#c5701f`, `#b04f86`, `#c9cbc4` | `series-*` | Dashboard charts only |
| (literal) | `#efeee8` | `bg-[#efeee8]` | Product illustration backdrop (`ProductArt`) |
| (literal) | `rgb(255 255 255 / .85)` | `text-white/85` | Demo banner text |

## Brand colours (per business)

| Variable | Default in globals.css | Lensmere demo value | How it is set |
|---|---|---|---|
| `--brand` | `#1f2b22` | `#1F2B22` (deep green) | `businesses.brand_color` (Settings → Branding) |
| `--brand-ink` | `#ffffff` | `#ffffff` | computed |
| `--accent` | `#b5e14a` | `#B5E14A` (lime) | `businesses.accent_color` |
| `--accent-ink` | `#18191b` | `#18191b` | computed |

`layout.tsx` wraps the whole site in `<div style={brandVars(biz.brandColor, biz.accentColor)}>`. `brandVars()` (`../components/supporting/lib/color.ts`) returns the four variables; each `*-ink` is `readableOn(colour)` — whichever of `#18191b` (ink) or `#ffffff` has the higher WCAG contrast ratio against that colour (ties go to ink). So a light brand colour automatically gets dark text.

Where they appear: `--brand` = header logo circle, primary buttons ("Book an exam", "Book here", "Request appointment", "Send message"), completed booking-step badges, the home CTA panel and the footer background; `--brand-ink` = text on those. `--accent` = the lime "Book an eye exam" footer pill, the "Book an appointment" button in the CTA panel, text selection highlight; `--accent-ink` = text on those.

**GHL:** set these as the site's global colours (GHL website builder → Settings → Colours): Primary `#1F2B22`, Secondary/Accent `#B5E14A`, Text `#18191B`, Body text `#5C5E63`, Muted `#86888D`, Background `#F6F6F3`, Surface `#FFFFFF`, Border `#E7E7E2`. There is no automatic "ink" calculation in GHL — pick white or `#18191b` text manually per button.

## Typography

| Token | Value | Notes |
|---|---|---|
| `--font-sans` | `var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif` | **Inter Tight** — body text. Loaded via `next/font/google` without a weight list → the full variable font (100–900). Body uses `font-feature-settings: "ss01", "cv11"`. Weights used: 400 (body), 500 (medium: buttons, labels, nav-pill text, product names), 600 (semibold: eyebrows, step titles, choice names). |
| `--font-display` | `var(--font-instrument), var(--font-inter-tight), ui-sans-serif, sans-serif` | **Instrument Sans** — headings and display numbers. Loaded weights **500, 600, 700**; the site uses **600** for headings and 400-ish defaults for prices set in the display face (falls back to the nearest loaded weight, 500). `.font-display` also sets `letter-spacing: -0.02em`. |
| `font-mono` | Tailwind default `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | Section indexes ("01"), service row numbers, step badges |
| `.tabular` | `font-variant-numeric: tabular-nums` | Prices, hours, counts |

Google Fonts link (used by the standalone pages):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@100..900&family=Instrument+Sans:wght@500;600;700&display=swap">
```
GHL: both families are on Google Fonts, so they can be chosen in the builder's typography settings (Headings: Instrument Sans 600; Body: Inter Tight 400/500).

### Type scale used by the site (px; mobile → ≥ 640px)

| Role | Size | Weight | Line height | Font |
|---|---|---|---|---|
| Home H1 | 44 → 64 | 600 | 1.02 | display |
| Page H1 (PageIntro, About) | 40 → 56 | 600 | 1.04 | display |
| Booking H1 | 40 → 52 | 600 | 1.04 | display |
| Legal H1 | 40 → 50 | 600 | 1.05 | display |
| Product H1 | 38 → 46 | 600 | 1.05 | display |
| Section H2 (SectionHead) | 30 → 38 | 600 | 1.1 | display |
| CTA H2 | 34 → 44 | 600 | 1.08 | display |
| Stats numbers | 26 | 600 | 1.5 | display |
| Card titles | 19–22 | 600 | 1.25–1.5 | display |
| Lead paragraph | 17 | 400 | 1.625 | sans |
| Body | 14–16 | 400 | 1.625 | sans |
| Nav links / buttons md | 14 | 400 / 500 | 1.5 | sans |
| Button lg | 15 | 500 | — | sans |
| Form labels | 12.5 | 500 | — | sans |
| Inputs | 13.5 | 400 | — | sans |
| Eyebrow | 12, uppercase, tracking 0.14em | 600 | — | sans |
| Meta / hints | 12–13.5 | 400 | — | sans |

## Radii

| Token | Value | Use |
|---|---|---|
| `--radius-control` | 10px | Inputs, selects, time-slot buttons, `FormError` |
| `--radius-card` | 14px | (theme token) — booking choice cards and date buttons use a literal 14px |
| `--radius-canvas` | 20px | (theme token) — cards: branch cards, value grids, inquiry form, FAQ aside |
| literal 16px | | Product art, hero stats strip |
| literal 24px | | Hero main image, booking card |
| literal 28px | | Home CTA panel, product-detail image |
| `rounded-full` (9999px) | | Buttons, nav pills, category pills, chips, badges, logo mark |

## Shadows and effects
- `--shadow-pop`: `0 12px 32px -12px rgb(24 25 27 / .22), 0 2px 6px -2px rgb(24 25 27 / .08)` — toasts/popovers (dashboard); not visible on the public site.
- Inset rings instead of shadows: active nav pill `inset 0 0 0 1px var(--line)`; selected booking choice `inset 0 0 0 1px var(--ink)`.
- Header: `backdrop-filter: blur(12px)` over 90% canvas.
- Hover: product images `scale(1.03)` over 500ms; brand buttons `brightness(1.1)`, accent `brightness(.95)`.
- Focus: `outline: 2px solid var(--ink); outline-offset: 2px` on `:focus-visible`. Inputs: ink border + `0 0 0 2px rgb(24 25 27 / .1)` ring.
- `::selection`: accent background, accent-ink text.
- `prefers-reduced-motion: reduce` → transitions/animations ~0ms.

## Layout
- Container: max-width 1200px, centred, padding 20px (32px ≥ 640px).
- Breakpoints (Tailwind defaults): `sm` 640px, `md` 768px, `lg` 1024px.
- Header height 64px (sticky). Footer top margin 96px.
- Section rhythm: 80px vertical padding on home sections; page intros 56px → 80px.
