# Design references

The live sites were captured with headless Chromium on **19 October 2026**: desktop at 1440 × 900 and mobile at 390 × 844. Cookie banners were dismissed where a button existed. The screenshots were taken for study only. They are not in this repository and nothing from them (logos, photography, artwork, copy) is used on the site.

## What was and wasn't inspected

| Source | Pages captured | Could it be inspected? |
|---|---|---|
| **Ace & Tate** (aceandtate.com, UK store) | Home (desktop + mobile), glasses collection, product page, the lens-selection drawer (all steps), cart | **Yes.** The checkout itself was not reachable: the product page said "Shipping to your region is unavailable", so the cart stayed empty. |
| **Oliver Peoples** (oliverpeoples.com) | Home, eyeglasses collection, product page and the lens steps, mobile menu, footer | **Partly.** The product grid on the collection page loaded only partially in the headless browser, so the collection layout below the category banners wasn't seen in full. |
| **Jimmy Fairly** (jimmyfairly.com) | Home, glasses collection, product page, cart, start of checkout, mobile menu | **Partly.** A country/region modal (it rendered with the title "undefined") covered every page. The layout behind it was visible but dimmed, and the checkout steps couldn't be followed. |
| **Warby Parker** (warbyparker.com) | Home, eyeglasses collection | **Partly.** Home and the collection page loaded. Every product page returned a "down for scheduled maintenance" page during the session, so their product page and checkout were **not** inspected. |
| Behance, Awwwards, Mobbin | — | **Not inspected.** Mobbin needs an account. Behance and Awwwards weren't opened in this phase, so no claims are made about them. |

## Primary reference: Ace & Tate

I chose Ace & Tate because its structure fits an optician that sells frames, sunglasses, contact lenses and eye tests from a few branches. Its design is quiet enough that this business's own products can carry the page. What the site took from it (as a pattern, not as assets):

- **Navigation.** A thin notice bar above a single-row header: wordmark, then the categories (Glasses, Sunglasses, Contact lenses, Accessories, Eye care). Stores, Help, search and the bag sit on the right. There is no mega-menu. On mobile, a full-height drawer.
- **Collection page.** A plain heading and a one-paragraph intro. Then a row of filter dropdowns (shape, colour, material, size) with sort on the right, a result count, and a four-column grid of flat light-grey product tiles. Each tile carries the name and price on one line and the colour name below. One editorial tile sits inside the grid.
- **Product page.** The gallery takes the left two-thirds; name, price, colour swatches and the primary action take the right. Specifications and the description sit under the gallery.
- **Lens selection.** A side drawer with numbered steps: lens type, lens option, prescription, review. A running subtotal and a Next button are pinned to the bottom. Ace & Tate allows "send it after your purchase", and this site offers the same choice (*send it later*).
- **Typography.** One grotesque family throughout (this site uses Host Grotesk, an open-licence Google font). The heading weight is regular, not bold, with tight tracking.
- **Colour.** Black and white, with light stone behind products. Colour comes from the photography, not from the interface.

## Secondary references

- **Oliver Peoples — product gallery.** Large packshots of the frame on a pale backdrop: front, three-quarter and side views. Material and lens details sit in a short spec list. This site's gallery uses the same three angles.
- **Jimmy Fairly — cart breakdown.** Each cart line lists its parts with their own prices (frame, then lenses, at 0 when included). This site's bag shows frame, lens and prescription the same way, so the customer can see what they're paying for.
- **Warby Parker — considered, not followed.** Its collection page puts the filters in a left-hand column. I chose Ace & Tate's row of dropdowns instead, which keeps the grid full width and works the same on mobile. Its visual style (bright blue buttons, a serif display face) was **not** used.

## What was deliberately avoided

The brief's banned patterns, and how the site avoids them:

- No gradients, glassmorphism, floating shapes or decorative blobs. The only gradient-like effect is the natural shading in the renders.
- No purple or blue SaaS palette. Dark surfaces use the business's own brand colour (`#1F2B22`, a deep green). One lime accent (`#B5E14A`) is kept for the eye-exam call to action only.
- No rounded "cards with shadows". Product tiles are flat stone rectangles with no shadow. The radius is 4 px on inputs and pill-shaped on buttons, and that's all.
- No three-column "features" rows with icons, no testimonials (there are no real reviews to show), no "bestseller" or "most popular" claims (the site has no data to support them), and no invented statistics.
- No stock or AI-generated photography. See below.

## Imagery: renders and stock photos

Photography decides whether an eyewear site looks premium, and the brief rules out AI-generated stock imagery. The options were:

1. **Stock photo libraries** (Unsplash, Openverse, Wikimedia Commons) were searched for eyewear and optometry images. The usable results were few, inconsistent in light and background, often showed recognisable branded frames, and carried mixed licences. They could not produce a coherent product grid.
2. **The real products** have no photographs: the demo catalogue in the dashboard is made-up data.
3. **Original renders.** I chose this first. Every frame in the catalogue is modelled from its name, shape and material (`tools/renders/`). It is lit as a studio packshot and path-traced on the local GPU (three.js + three-gpu-pathtracer), at three angles per colour. The product tile backdrop (`--stone`, `#F0F0ED`) is the exact render backdrop, so images sit on the tiles without a visible edge. The editorial scenes (frames on oak, plaster and stone with window light) are made the same way.

What the renders are not: they are not photographs of products a customer could buy, and no models wear the frames.

**What shipped (20 October 2026).** Rendering the whole catalogue takes about an hour and a half of GPU time, which the laptop used for this project couldn't sustain. So the site uses a mix:

- **Renders (three angles per colour):**
  - 4 frames: Arden 101, Arden 204, Arden Round 33 and Halden Wire. These appear first on the home page and in the collections.
  - 9 contact-lens and care products.
  - All 10 editorial scenes.
- **Stock photos for everything else:** 11 photos of eyeglasses chosen by the project owner from **Pexels**. They're used under the Pexels licence: free to use and modify, attribution not required, though it is given below. Each product without a render shows one of them, matched by colour where possible (black, tortoise, clear, gold or silver frames). On the product page the photo is labelled **"Illustrative photo"**, because it isn't a picture of that exact frame.
  - The photos are cropped to the tiles' 4:3 shape by `tools/stock/import.mjs`.
  - The assignment is in `src/lib/media.ts`.
- **Known gaps:**
  - All 11 photos show clear-lens eyeglasses, so the sunglasses and accessories (cases, cloth, chain, cord, nose pads, repair kit) also show eyeglasses photos.
  - Adding sunglasses and accessory photos to the import list, or finishing the renders (`node tools/renders/render.mjs --skip-existing`), replaces them without touching any component.

A real launch should replace all of these with photography of the actual stock.

| Photo (in `public/media/stock/`) | Photographer on Pexels |
|---|---|
| `black-cateye` | Efrem Efre |
| `black-orange` | Shliftik |
| `black-halfrim` | Steve |
| `grey-square` | Pixabay |
| `brown-round` | Ashutosh Sonwani |
| `clear-pink` | RDNE Stock project |
| `silver-hands` | Arina Krasnikova |
| `gold-round` | Pavel Danilyuk |
| `gold-newspaper` | Asumaani |
| `metal-teal` | Silviu Din |
| `store-wall` | Karola G |
