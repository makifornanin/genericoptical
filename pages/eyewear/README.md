# Eyewear — `/eyewear`

- **SEO title:** Eyewear · {Business}
- **SEO description:** Prescription frames, sunglasses, contact lenses and eye-care accessories. Try anything on in branch.
- **Reference:** `screenshots/desktop/eyewear.png`, `screenshots/states/eyewear-filtered-sunglasses.png`, `screenshots/states/eyewear-no-results.png`

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-intro.html` | Page intro (static copy) |
| 2 | `blocks/02-catalogue.html` | Category pills with counts, search, product grid, empty state, price note, optional store link |
| — | `99-page-script.html` | Catalogue data + `eyewear.js` |
| — | OC Footer | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## How it works

- **Products** come from `scripts/oc-catalogue.js` (display data, generated from the dashboard export; see `tools/README.md`). **Categories** come from `OC_CONFIG.catalogue.categories`. Categories with no products are hidden.
- **Filters live in the URL**, so they can be linked from menus or ads:
  - `/eyewear?category=frames`
  - `/eyewear?category=sunglasses&q=polarised`
- Search matches name, brand, category, colour/size labels and description.
- Cards link to `/eyewear-item?p=<id>`. Cards show "N options" when there are several variants, and an **Online** tag when the product has a `storeUrl`.
- **No stock is shown here.** Live stock exists only in the native GHL store (ghl-setup-guide.md §11). The price note under the grid comes from `business.priceNote`.

## Native-store alternative

- To show the native GHL store list instead of this showcase, put the store's **Products list** page in the menu instead of `/eyewear` (guide §11, setup B).
- The native list shows live stock, but it uses the builder's own styling.
