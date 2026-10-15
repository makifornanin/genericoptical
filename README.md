# Optical customer website (GoHighLevel-ready)

The customer-facing website for an optical shop or eye clinic: home, eyewear catalogue, product pages, services, booking, contact, about, FAQ, privacy, terms and confirmation pages. It is designed to be **built inside GoHighLevel (GHL)** and reused for different optical businesses.

**Relation to the dashboard:**
- This is **a separate project** from the management dashboard (Next.js + PostgreSQL: POS, inventory, CRM, analytics, GHL integration). They share no code and no dependencies.
- The design comes from the dashboard's original public website, archived in `customer-website-reference/` in the dashboard repository.
- At runtime the two meet only through GHL:
  - **website → GHL:** forms, calendars and store;
  - **GHL → dashboard:** the dashboard's existing GHL integration syncs contacts, appointments and online orders;
  - **dashboard → GHL:** products, prices and stock.

```
optical-customer-website/
├── README.md                 ← you are here
├── ghl-setup-guide.md        ← step-by-step GHL build + test checklist (start here to implement)
├── design-system/README.md   ← tokens, typography, components, rules, changes from the original
├── styles/oc-base.css        ← global CSS (scoped under .oc)
├── scripts/
│   ├── oc-config.js          ← the business: name, colours, branches, hours, services, FAQs, form/calendar IDs
│   ├── oc-catalogue.js       ← showcase products (generated from the dashboard export)
│   └── oc-site.js            ← core script: theme, header/footer, GHL embeds, renderers
├── components/               ← header.html, footer.html (GHL Universal sections)
├── pages/
│   ├── pages.json            ← every page: GHL path, SEO title/description
│   └── <page>/               ← home, about, eyewear, product-detail, services, booking, contact, faq,
│       ├── README.md            privacy, terms, booking-confirmed, thank-you
│       ├── blocks/NN-*.html  ← one GHL Custom Code element each, in order
│       ├── <page>.css        ← page Custom CSS (when the page has its own sections)
│       └── <page>.js         ← page script (when the page renders data)
├── ghl-ready/                ← GENERATED paste-ready snippets (site/, pages/, hosted/) + paste order
├── assets/                   ← favicon, 51 product illustrations
├── tools/                    ← build-ghl.mjs, catalogue-from-csv.mjs (not pasted into GHL)
├── previews/                 ← local preview, Playwright tests, screenshot tools (not pasted into GHL)
└── screenshots/              ← mobile/tablet/desktop/wide per page, states, white-label, compare
```

## See it locally

```bash
node previews/build.mjs && node previews/serve.mjs
# → http://localhost:4310/previews/site/index.html
```

You can also open `previews/site/_pages.html` straight from the file system.

The sample business, **Lensmere Optical, is fictional**. Native GHL forms, calendars and store elements aren't simulated: you'll see clearly labelled placeholders where they go.

## Build it in GHL

Follow **[ghl-setup-guide.md](ghl-setup-guide.md)**. In short:

1. Edit `scripts/oc-config.js` for the business.
2. Run `node tools/build-ghl.mjs`.
3. Paste `ghl-ready/site/*` once: fonts, header section with the global CSS, footer section with the config and core script.
4. For each page, paste `ghl-ready/pages/<page>/*` (page CSS, blocks in order, page script).
5. Connect a native GHL form and calendars by setting their IDs in the config.
6. Optionally set up the native GHL store for online purchases, with live stock synced from the dashboard.
7. Run the test checklist on a test sub-account.

## White-label

Everything business-specific lives in `scripts/oc-config.js`:
- name, logo, colours (text contrast handled automatically);
- contact details, social links, opening hours, branches, services (enable or disable each);
- promo banner, hero copy, hero images, testimonials, navigation, FAQs, legal details.

`previews/examples/alt-config.js` builds a different business from the same code (screenshots in `screenshots/white-label/`), and a test checks the result.

## Quality checks

```bash
cd previews && npm install && npm test
```

**99 tests:**
- every page at 4 widths: overflow, console errors, links, images;
- behaviour: menu, catalogue, product, booking, FAQ, embed assembly;
- axe WCAG 2.2 AA on every page;
- the white-label config;
- static safety: CSS scoping, no secrets, no privileged APIs, GHL snippet structure;
- the catalogue tool.

## Status — what is and isn't verified

| Area | Status |
|---|---|
| Design, layout, responsiveness, accessibility, behaviour | Verified locally (tests and screenshots) |
| GHL snippet structure (scoped CSS, top-level scripts, single-root blocks) | Verified locally; built from GHL documentation |
| Native GHL form, calendar and store embeds | URLs and attributes verified locally against GHL's documented embed format. **Not tested in a GHL account.** |
| Behaviour inside the GHL builder (code element limits, Universal sections, page Custom CSS, hydration) | Documented, partly from community sources. **Not tested.** |
| Sync of website inquiries, bookings and orders to the dashboard; product/stock sync to the GHL store | Implemented in the dashboard and tested there against a simulated GHL API. **Not tested against a live sub-account.** |
| Legal pages | Draft text; needs legal review (visible notice until `legal.draft: false`) |
