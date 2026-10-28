# Design system

Plain CSS, no framework. The styles are in four files, loaded in order by `src/app/layout.tsx`:

| File | Holds |
|---|---|
| `src/styles/tokens.css` | every colour, size, space and timing value (CSS custom properties) |
| `src/styles/base.css` | reset, type scale, links, focus ring, layout helpers |
| `src/styles/components.css` | reusable pieces: header, footer, buttons, tiles, forms, drawer, notices |
| `src/styles/pages.css` | page layouts: home bands, collection toolbar, product page, bag, checkout, order tracker |

The rule: a value that appears twice becomes a token. Components use tokens, never raw hex or pixel values for colour or spacing.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#121212` | text, primary buttons, hairlines that carry structure |
| `--ink-2` / `--muted` | `#3b3b38` / `#6b6b66` | secondary text; `--muted` is AA on white and on stone |
| `--paper` | `#ffffff` | page background |
| `--stone` / `--stone-2` | `#f0f0ed` / `#e6e6e1` | product tiles and image backgrounds. `--stone` is exactly the render backdrop (rgb 240 240 237), so images sit on it without an edge |
| `--line-soft` | `#dcdcd6` | dividers inside forms and lists |
| `--brand` / `--brand-ink` | business colour from the dashboard, default `#1f2b22` / white | topbar, footer, the dark band on the home page |
| `--accent` / `--accent-ink` | business accent, default `#b5e14a` / `#121212` | **only** the eye-exam call to action. Never decoration |
| `--pos` `--warn` `--neg` | green / amber / red | stock dots and notices; always paired with text |
| `--focus` | `#1f5fd1` | the 2 px focus ring |

`--brand` and `--accent` come from the business's colours in the dashboard (`/site` → `branding`). `src/lib/theme.ts` checks each against its ink colour, picks black or white text for at least 4.5 : 1, and falls back to the defaults if a colour is missing or invalid. The site never uses gradients, translucent "glass" layers or coloured shadows.

## Type

One family: **Host Grotesk** (Google Fonts, open licence), loaded with `next/font` so there's no layout shift and no third-party request at runtime.

| Token | Size | Use |
|---|---|---|
| `--t-3xl` | 36 → 58 px | the home hero caption only |
| `--t-2xl` | 30 → 44 px | page titles (h1) |
| `--t-xl` | 24 → 30 px | section titles (h2) |
| `--t-l` / `--t-m` | 22 / 18 px | product names on the product page, lead paragraphs |
| `--t-b` | 16 px | body, inputs (16 px stops iOS zooming into fields) |
| `--t-s` / `--t-xs` | 13.5 / 12 px | tile meta, captions, legal |

Headings are weight 500 with `-0.022em` tracking. There are no all-caps headings and no letter-spaced labels. Prices use tabular figures.

## Space and layout

- `--gutter` (16 → 32 px) on page edges; `--section` (48 → 88 px) between sections; content max width 1520 px.
- Collection grid: 2 columns, 3 from 900 px, 4 from 1240 px. Gaps are 12–16 px across and 32–44 px down, so the name and price stay attached to their image.
- Product page: from 1000 px, the gallery and buying panel split 7 : 4 and the panel is sticky. The gallery is a two-column image grid on desktop and a swipeable row on mobile, with the buying panel below it.
- Radius: `--radius` 4 px on inputs and selects; buttons are pills. Tiles, images and panels are square.
- Shadows: none, except the drawer scrim.

## Components

| Component | Notes |
|---|---|
| Topbar | one line of plain text (the demo notice). No carousel |
| Header | wordmark (the business name, set in type), primary nav, Stores / Help, search, bag with count. Under 1040 px: menu button → left drawer with focus trap and Escape |
| Buttons | `.btn--primary` (ink), `.btn--secondary` (outline), `.btn--light` (on photos), `.btn--accent` (eye exam only). Height 48 px |
| Tile (`ProductTile`) | stone image area, then name and price on one row and the colour name below. Swatch dots for other colours. No hover zoom; the second image fades in on hover when one exists |
| Swatches | real colour, or the tortoise pattern (`public/media/swatches/tortoise.svg`). Selected = ink ring. Each one is a link (`?colour=`) so it works without JavaScript |
| Filters | dropdown panels (shape, colour, material, size) + sort; chosen filters as removable chips; URL state so filtered links can be shared |
| Drawer | portal to `<body>`, focus trap, Escape and scrim close it, returns focus to the opener. Used for the menu, the lens steps and "added to bag" |
| Lens steps | numbered steps with a progress bar and a pinned subtotal; options are radio cards with the price on the right |
| Notices | `.notice` (neutral), `--ok`, `--warn`, `--error`; errors get `role="alert"` and receive focus |
| Stock dot | coloured dot + words ("In stock", "Low stock", "Order in"). Colour is never the only signal |
| Order tracker | a vertical list of steps (placed, confirmed, being prepared, ready to collect, collected) built from the dashboard's real status history |

## Motion

160 ms and 280 ms with one easing curve, used for the drawer, dropdowns and image fades only. There are no scroll-triggered animations. `prefers-reduced-motion` sets both durations to 0.

## Accessibility

WCAG 2.2 AA is the target and is tested with axe on every page at mobile and desktop widths (`tests/e2e/a11y.spec.ts`). The site has:

- a visible focus ring on every interactive element and a skip link
- a single h1 per page and labelled landmarks
- labels on every field, errors linked to their fields, and 44 px minimum targets
- alt text on product-page images (name, colour and view). Tile images and decorative editorial images use `alt=""` because the tile's link text already names the product

## Imagery

- **Renders** (`tools/renders/`, see its README.md): `public/media/products/<slug>/<colour>-<view>-<width>.webp`, with views `front`, `angle` and `side` at 800 and 1600 px. Editorial images are `public/media/editorial/<name>-<width>.webp`.
- **Stock photos** (`tools/stock/import.mjs`): `public/media/stock/<name>-<width>.webp`, cropped to 4:3. A product without a render shows one of them, matched by colour, and the product page labels it "Illustrative photo". Credits are in DESIGN_REFERENCES.md.
- **Manifest:** `src/lib/media-manifest.json` (written by `node tools/renders/manifest.mjs`) lists what exists.
- **Order of preference:** render, then stock photo, then the image set in the dashboard. With none of them, the tile shows an empty stone area above the name.
