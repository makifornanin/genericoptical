# Legacy: GoHighLevel-builder version (superseded)

This folder keeps the **previous version** of the customer website, which was designed to be pasted into the GoHighLevel website builder (custom-code blocks, a global config script and native GHL forms/calendars/store). It is **superseded** by the Next.js app at the root of this repository and is kept for reference only:

- it is **not built, linted, type-checked or deployed** (excluded in `tsconfig.json` and `eslint.config.mjs`);
- its preview and tests in `previews/` are no longer run (their `node_modules` were removed);
- paths inside these files refer to the old layout (for example `styles/oc-base.css`, `pages/<page>/<page>.css`, `assets/products/`). In the app those files now live at `src/styles/oc-base.css`, `src/styles/pages/<page>.css` and `public/products/`;
- `scripts/oc-config.js` and `scripts/oc-catalogue.js` hold the fictional "Lensmere Optical" sample data. The app gets its data from the dashboard API instead; the test fixtures (`tests/fixtures/data/`) are generated from these two files by `tests/fixtures/generate-fixtures.mjs`;
- screenshots of this version are in `screenshots/ghl-version/`.

| Path | What it was |
|---|---|
| `ghl-setup-guide.md` | Step-by-step GHL build guide |
| `ghl-ready/` | Generated paste-ready snippets (`tools/build-ghl.mjs`) |
| `components/` | Header and footer blocks |
| `pages/<page>/blocks/`, `pages/<page>/<page>.js` | Page blocks and page scripts (ported to `src/app` and `src/components`) |
| `pages/pages.json` | Page list with SEO titles |
| `scripts/oc-site.js` | Core script: theme, header/footer, embeds, renderers (ported to `src/lib` and `src/components`) |
| `tools/catalogue-from-csv.mjs` | Built `oc-catalogue.js` from a dashboard CSV export (the catalogue now comes from the API) |
| `previews/` | Local preview build, Playwright tests and screenshot tools for this version |
| `assets/README.md` | Notes on the product illustrations |
