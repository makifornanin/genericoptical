# Local preview and tests

Preview, screenshot and test tooling. **Nothing in this folder is pasted into GHL.** The preview loads the real GHL files (`styles/`, `scripts/`, `components/`, `pages/`) in place.

## View the site

**No install needed:**
```bash
node previews/build.mjs     # assembles previews/site/*.html
node previews/serve.mjs     # http://localhost:4310/previews/site/index.html
```

**From the file system:** open `previews/site/_pages.html` directly; links between pages work. Fonts need an internet connection.

## What the preview shows, and what it doesn't

- **Same as GHL:** the exact blocks, CSS, config and scripts you paste into GHL, assembled in the same order.
- **Preview-only additions:**
  - `window.OC_PREVIEW`, which maps GHL paths such as `/eyewear` to `eyewear.html` and points at `assets/`;
  - a `<main>` wrapper.
- **Not simulated:** native GHL forms, calendars and the store. With no IDs in `OC_CONFIG`, a labelled **"GHL form" / "GHL calendar" placeholder** shows instead, and nothing can be submitted or booked.
- **Sample data:** the business is fictional: Lensmere Optical, with sample prices and branches.

## Tests (Playwright + axe)

```bash
cd previews
npm install        # once: @playwright/test, @axe-core/playwright (Chromium is reused if installed)
npm test           # builds, then runs every test
```

| Suite | Checks |
|---|---|
| `pages.spec.mjs` | Every page at 390 / 768 / 1280 / 1920px: renders fully, no horizontal overflow, one h1, no broken images, internal links resolve, no raw `{{…}}`, no console errors, header touch target |
| `behaviour.spec.mjs` | Mobile menu and keyboard, skip link, current page; home sections; catalogue filter, search, URL state and empty state; product variants, images and inquiry prefill; booking deep links and branch switching; FAQ structured data; legal draft notice; **how the GHL form and calendar embeds are assembled** (all GHL requests are stubbed); merge-tag fallback |
| `a11y.spec.mjs` | axe WCAG 2.2 AA on every page, phone and desktop; serious or critical issues fail |
| `white-label.spec.mjs` | A second business config (`examples/alt-config.js`) changes name, colours, menu, branches, services, options and copy |
| `static.spec.mjs` | CSS scoped under `.oc` with `--oc-` variables only; blocks are single-root snippets with no scripts or inline handlers; no secrets or privileged API calls in browser code; no GHL-reserved page paths; `ghl-ready/` is fresh; snippet scripts sit at the top level |
| `catalogue-tool.spec.mjs` | `tools/catalogue-from-csv.mjs` against a sample dashboard export |

The embed tests only check the URLs and attributes the site builds. **They don't prove GHL accepts them.** That needs the live checklist in `ghl-setup-guide.md` §13.

## Screenshots

```bash
cd previews && npm run screenshots   # → screenshots/{mobile,tablet,desktop,wide}, states, white-label
node tools/compare.mjs               # → screenshots/compare (original vs rebuild; needs the dashboard repo next to this one)
```
