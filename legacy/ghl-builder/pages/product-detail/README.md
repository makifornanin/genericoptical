# Product — `/eyewear-item`

- **SEO title:** Eyewear · {Business}. The script sets the browser title to "{Product} · {Business}".
- **SEO description:** Frame details, available sizes and colours, and how to try it on or reserve it.
- **Reference:** `screenshots/desktop/product-detail.png`, `screenshots/states/product-inquiry-open.png`

**Path:** use `/eyewear-item`, **not** `/product`. GHL reserves `/product/…` for its own store pages.

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-product.html` | Product detail, inquiry panel and related products, all rendered for `?p=<id>` |
| — | `99-page-script.html` | Catalogue data + `product-detail.js` |
| — | OC Footer | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## What the page shows

- **Gallery:** the main image + thumbnails (`images`). Choosing a colour variant switches to its image (`variants[].image`).
- **Brand · category**, name and price ("from" when there are several variants; a variant's own price shows when it is chosen).
- Description, and **variant chips** (selectable buttons).
- **Availability note:**
  - `catalogue.availabilityNote` (or the product's `note`);
  - "available to order online" when `storeUrl` is set.
- **Actions:**
  - **Ask about this** opens the **native GHL form**, prefilled with hidden fields `product_name` (with the chosen variant), `inquiry_kind=product_inquiry` and `source_page`. The form loads only when the panel is opened (faster page).
  - **Book a fitting / Book a lens consultation** → `/book?service=<category.bookService>`.
  - **Buy online** (only with `storeUrl`) → the native GHL store product page, with live stock and checkout.
- **More …:** up to 4 products from the same category.
- A URL with `&ask=1` opens the inquiry panel straight away (useful in emails).

## Without a form ID

A dashed **"GHL form"** placeholder lists the fields and the hidden product value; nothing is submitted. Set `OC_CONFIG.forms.product` (or `forms.contact`) — guide §9.

## Unknown or missing product

- `?p=` with an unknown id shows "We couldn't find that product…" with a link back to Eyewear.
- With no `?p=` (e.g. when opened from the GHL editor) the page shows "Choose a frame…".
