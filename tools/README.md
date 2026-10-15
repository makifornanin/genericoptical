# Tools

Node scripts that maintain the GHL code. They use plain Node 18+ with no packages, and **nothing here is pasted into GHL.**

## `build-ghl.mjs` — paste-ready snippets

```bash
node tools/build-ghl.mjs        # → ghl-ready/
```

- **When to run it:** after editing anything in `styles/`, `scripts/`, `components/` or `pages/`, and especially **after editing `scripts/oc-config.js`**, since the config travels inside the footer snippet.
- **What it does:** wraps the CSS and JavaScript in the exact `<style>`/`<script>` structure GHL needs. Scripts always go at the top level of a snippet, and closing-tag text inside code is escaped.
- **What it writes:** `ghl-ready/README.md`, with the paste order and SEO text per page.
- **Freshness check:** a test fails if `ghl-ready/` is out of date.

## `catalogue-from-csv.mjs` — showcase products from the dashboard

The dashboard is the source of truth for products and prices. To refresh the website's showcase (`scripts/oc-catalogue.js`):

1. Dashboard → **Products → Export CSV**.
2. Run:
   ```bash
   node tools/catalogue-from-csv.mjs ~/Downloads/products.csv --previous=scripts/oc-catalogue.js --out=scripts/oc-catalogue.js
   node tools/build-ghl.mjs
   ```
3. Re-paste `ghl-ready/pages/{home,eyewear,product-detail}/99-page-script.html` in GHL (or re-upload `oc-catalogue.js` if you use hosted files).

**Taken from the export:**
- product names, brands, categories, descriptions, variants and prices (lowest = "from" price);
- inactive rows, services and made-to-order lenses are skipped.

**Kept from the previous file** (website-only fields): images, featured order, `storeUrl`, notes, and per-variant images.

**New products** get a placeholder illustration per category and are listed on the terminal. Add a real image path or URL for them.

**Category mapping:** dashboard category names map to website categories (Frames, Sunglasses, Contact lenses → their own; Cleaning, Cases, Accessories → Accessories). Override it with
`--map="Optical frames=frames,Sun=sunglasses"`.

**Not live:** the result holds **no stock**. Live stock appears only in the native GHL store, which the dashboard keeps in sync. A future option is a read-only public catalogue feed served by the dashboard, which would make the showcase live without exposing private APIs; it would need a dashboard change.
