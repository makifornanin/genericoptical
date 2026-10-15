# Design research and design system

This records which references were actually inspected, why one was chosen, and the design system derived from it. Every observation below comes from images that were downloaded and viewed on 2026-10-15.

## 1. References: what was and wasn't inspected

| Reference | URL | Inspected? | How |
|---|---|---|---|
| **STOCKPOS: Point of Sale (POS) System UI/UX Design** (Riseup Labs, published May 12 2026) | https://www.behance.net/gallery/249215567/Point-of-Sale-%28POS%29-System-UIUX-Design-Case-Study | **Yes**: 14 project images | Loaded in headless Chromium (Playwright); the project-module images were saved and viewed at full size. |
| **INVENZO: Inventory Management Dashboard** (Sumit Bisht and co-owners, published Jan 30 2026) | https://www.behance.net/gallery/243159739/INVENZO-Inventory-Management-Dashboard | **Yes**: 10 project images, with the long screen board cropped into sections | Same method. |
| **Inventra: A Smarter Way to Manage Retail Operations** | https://www.behance.net/gallery/256021255/Inventra-A-Smarter-Way-to-Manage-Retail-Operations | **No** | Behance returned HTTP 403 to curl, to the web-fetch tool, and to headless Chromium on two attempts. Nothing in this system is credited to Inventra. |
| Original Panapa Antipara website (the existing project) | Local screenshots: `GHL projects/PanapaAntipara/samplewebsite*.png` | Yes | Used as the starting point for the public website's look and feel (layout rhythm, type scale, pill navigation), with all Panapa branding removed. |

## 2. Primary reference: STOCKPOS

**Why it fits.** STOCKPOS is a retail point-of-sale and operations system, the same category as this product. Its visual language is the most restrained of the three references: a near-monochrome ink palette with one acid-lime accent, quiet hairline borders, compact metric tiles, and black bar charts instead of rainbow gradients. It avoids what the brief rules out (glassmorphism, blue gradient KPI cards, tinted icon bubbles), and its POS screen solves the hardest interface in this product: catalogue, cart, totals and payment on one screen. INVENZO was rejected as the primary reference because it relies on exactly those patterns: blue gradient bars, tinted icon circles behind every KPI, and a four-colour donut.

### Observations from the inspected STOCKPOS screens

1. **Navigation layout.** A slim near-black icon rail sits on the far left. The active item is a filled lime circle with a dark glyph, and logout is a red-tinted circle at the bottom. The whole working area is one white canvas with large rounded corners, inset into the dark frame, so it reads as an app sitting inside a frame. Inside the canvas, a top bar holds the page title on the left and round outline icon buttons (search, notifications, settings), an outline "+ New Order" pill and an avatar on the right.
2. **Typography.** The case study names its fonts: **Inter Tight** for body text and **ZT Nature** (a modern grotesk) for titles. Labels are small and grey (≈11–12px); values are bold and large (≈24–28px). Table headers are small uppercase grey text with wide letter-spacing.
3. **Colour palette.** Documented swatches: `#FFFFFF`, `#D4D4D4`, `#6B6B6B`, `#202020` and the accent `#A8E63D`. Lime is used sparingly: the active nav item, positive delta pills (pale lime fill, dark text), the chart line and area, the primary donut segment, the quantity "+" button and the single "Continue" checkout button. Red marks negative deltas and destructive actions; a muted purple marks "Processing".
4. **Spacing.** About 24px of canvas padding, 16–20px gaps between cards, about 20px of padding inside cards, and table rows about 44px tall.
5. **Card structure.** White cards with a faint 1px border, a radius of about 16px and no visible drop shadow. Each KPI card has an outline-circle icon (top left), a "…" menu (top right), a grey label, a bold value, a delta pill and a "vs last week" note. **The first KPI card is inverted** (ink background, white text, lime icon) to anchor the headline metric. One chart card (Sales by Category) is also inverted.
6. **Table styling.** No outer box. A light grey header band carries uppercase grey labels, and rows are divided by hairlines. IDs are bold (`#ORD-5821`). Statuses are small tinted text pills (green "Completed", purple "Processing"). Relative times ("2 min ago") sit in grey on the right, and a small dark "View All" pill sits top-right.
7. **Chart presentation.** The monthly sales chart uses thin, narrow black bars with rounded tops, faint gridlines and small grey axis labels, with a "+18.4% YoY" pill in the corner. Weekly revenue is a lime line over a soft lime area fill, with a Week/Month/Year segmented control whose active segment is a black pill. Sales by category is a lime-and-grey donut on a dark card.
8. **Page composition.** The dashboard has a row of four KPI tiles, a row of three charts (bars, area, dark donut), then a wide table (Recent Orders) beside a narrow list (Top Products). The POS uses a four-column product grid on the left (light grey image well, black "218 Stock" badge, name, grey description, price and a full-width outline "Add to Cart" pill that turns into a black "Added (1)") and a light grey "Detail Transaction" panel on the right (line-item cards with a quantity stepper, a promo row, Sub-Total / Tax / Discount, a bold Total Payment, the payment method row and a full-width lime "Continue" button).

### What INVENZO contributes (secondary)

- A **global filter bar** in the top bar (store selector and date range): adopted as the branch and date-range controls.
- **Stock status vocabulary** (Healthy / Low Stock / Critical pills): adopted as In stock / Low / Out of stock.
- **Pagination footer** ("Showing 1 to 6 of 1160", Previous / Next): adopted.
- **Alert rows** with a severity rule on the left edge: adopted, but as a thin rule rather than a full coloured border.

## 3. Original design system ("Specta")

The system is original: it uses no STOCKPOS assets, logos or illustrations. It adopts the reference's structure (framed canvas, one inverted anchor tile, ink-and-lime restraint, hairline tables, thin black bars) and adapts it to an optical business with about 20 modules.

### Frame and navigation
- An **ink sidebar** with labelled groups (Overview, Sales, Customers, Inventory, Finance, Management). Labels are needed because this product has about 20 destinations, unlike STOCKPOS's seven icons. It collapses to an icon rail on narrower screens and becomes a drawer on mobile.
- **Framed canvas.** Content sits in a light canvas with a 20px top-left radius, inset from the ink frame. This is the product's signature shape.
- The **top bar** holds the page title and subtitle on the left and, on the right, the global branch selector, date range (where relevant), quick actions and an avatar menu.

### Colour tokens (see `src/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#18191B` | Sidebar, primary buttons, bars, headline text |
| `--canvas` | `#F6F6F3` | Working area background |
| `--surface` | `#FFFFFF` | Cards, tables, inputs |
| `--line` / `--line-strong` | `#E7E7E2` / `#D5D5CF` | Hairlines, input borders |
| `--text-2` / `--text-3` | `#5C5E63` / `#86888D` | Secondary text and meta (`--text-2` passes AA on white) |
| `--accent` | `#B5E14A` (brand-configurable) | One action per view, positive deltas, chart highlight, active nav |
| status: positive / warning / danger / info | `#2E6B35` / `#8A5A00` / `#B42318` / `#4D3FB0` on pale tints | Status pills and deltas only, never large fills |

The business's brand colour (set in Settings) drives `--brand` on the public website, the receipts and the login screen. The dashboard keeps its neutral ink so that any brand colour stays readable.

### Typography
- **Inter Tight** (400/500/600/700) for all UI, tables and numbers, with `tabular-nums` on figures. This matches the reference's body face.
- **Instrument Sans** (600/700) for page titles, KPI values and public-site display type. It stands in for ZT Nature, which isn't freely licensed.
- Dashboard scale: 11 (uppercase labels, +0.06em tracking), 12 (meta), 13 (tables), 14 (body), 16 (card titles), 22 (page titles), 26 (KPI values). Public site: 15 / 18 / 24 / 40 / 64 / 96.

### Spacing, radius and elevation
- 4px base unit. Canvas padding is 24px (16px on mobile), card padding 16–20px and grid gaps 16px.
- Radii: cards 14px, inputs and buttons 10px, chips and segmented controls fully round, canvas 20px.
- Cards have no shadow, only a border. Popovers, menus and dialogs carry a single soft shadow.

### Components
- **KPI tile.** Compact: a 12px label, a 26px value, a delta pill and a comparison caption. The first tile in a row is inverted (ink).
- **Tables.** A header band in `--canvas`, 11px uppercase labels, 44px rows, hairline dividers, right-aligned tabular numbers, small tinted status pills and a pagination footer.
- **Charts.** Black rounded bars, a lime line with a soft area fill, and a grey comparison series. Categorical charts use at most five restrained colours plus "Other". Gridlines are faint and there are no 3D effects or gradients beyond the single area fill.
- **Buttons.** *Primary* is an ink fill. *Accent* is a lime fill with ink text, used once per view for the "money" action (Complete sale, Record payment, Receive stock). *Secondary* is a white fill with a border, and *ghost* is text only.
- **Status pills.** Text with a pale tint and no border, using a small fixed vocabulary per domain.
- **Motion.** 150ms fades and colour transitions only, and it respects `prefers-reduced-motion`.

### Rules we don't break
1. One accent action per view.
2. No gradients on cards, no glassmorphism, no glows, no decorative shapes in the dashboard.
3. No icon backgrounds unless they encode state.
4. Numbers come from the database or aren't shown. Empty states say so plainly.
