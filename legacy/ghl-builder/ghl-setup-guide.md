# GoHighLevel setup guide

How to build this optical website in a GoHighLevel (GHL) sub-account, one step at a time.

**What's verified, and what isn't:**

- Everything here was tested in the **local preview** (`previews/`).
- **Nothing has been tested inside a real GHL account yet.**
- GHL behaviours marked *(unverified)* come from community reports, or aren't documented at all. Check them in a test sub-account first. The research behind this guide is summarised in [Appendix A](#appendix-a--ghl-behaviours-this-design-relies-on).

**Do not publish to a live domain** until the [test checklist](#13-test-the-published-website) passes on a test sub-account.

---

## 0. Before you start

**What you need**

- A GHL sub-account with Sites → Websites. For online sales you also need Payments → Products, a payment provider (e.g. Stripe), and an online store.
- The business details: name, legal name, logo, colours, phone, email, branches with addresses and opening hours, services with durations and prices, FAQs, and real customer reviews (optional).
- The files in this project. You paste from the paste-ready folder **`ghl-ready/`**, which is generated from the sources by `node tools/build-ghl.mjs`.

**How the site is put together**

| Piece | Built with | Where it comes from |
|---|---|---|
| Layout, typography, header, footer, cards, catalogue, booking/contact pages | **Custom Code elements** (HTML), styled by `oc-base.css` and page CSS | `components/`, `pages/<page>/blocks/` |
| Business details, branches, hours, services, FAQs, links, form and calendar IDs | **One config script** (`OC_CONFIG`) | `scripts/oc-config.js` |
| Showcase products (images, variants, display prices) | **Catalogue script** (`OC_CATALOGUE`) | `scripts/oc-catalogue.js`, generated from the dashboard export |
| Inquiry forms | **Native GHL forms** | GHL → Sites → Forms |
| Appointment booking | **Native GHL calendars** (GHL is the system of record) | GHL → Calendars |
| Online purchases, live stock, cart, checkout | **Native GHL store** | GHL → Payments → Products (synced from the dashboard) + Sites → Stores |
| SEO titles, favicon, domain, redirects, cookie banner | **Native GHL settings** | Website and page settings |

**Five GHL behaviours to know first**

1. **Code doesn't render in the editor canvas.** Custom Code elements show only a placeholder box while you edit. You see the real design in **Preview** and on the published page.
2. **Turn off "Optimize JavaScript"** for this website. With it on, GHL delays scripts until the visitor first interacts, so lists such as branches, services and products would appear late.
3. **Scripts sit at the top level of a code element**, never inside a `<div>`. The `ghl-ready` snippets are already built that way, and a test checks it.
4. **There's no site-wide "Custom CSS" box in website Settings.** The global stylesheet therefore travels inside the header section's code element. Page styles go in each page's Custom CSS.
5. **Large code may be limited** *(unverified)*. One user reports that the head tracking code field truncates at about 2,500 characters, so this guide keeps tracking code tiny. If GHL rejects a large Custom Code element, use the **hosted-files variant** ([section 6](#6-global-styles-and-scripts)).

---

## 1. Create the website

1. **GHL → Sites → Websites → New website → From blank.** Name it after the business.
2. **Website → Settings:**
   - **Favicon:** upload `assets/brand/favicon.ico` (or the business's own icon).
   - **Head tracking code:** paste `ghl-ready/site/A-head-tracking-code.html`. This loads the two Google Fonts: Inter Tight and Instrument Sans.
   - **Optimize JavaScript: off** (see "Five GHL behaviours" above).
   - Leave image optimisation on.
3. Optional: in website Settings, also set the default **typography** to Inter Tight for body text and Instrument Sans for headings, so native elements (forms, store) match.

## 2. Configure the business

Open `scripts/oc-config.js` in a text editor. It is commented line by line. Change at least the following:

| Setting | What to enter |
|---|---|
| `business` | Name, legal name, tagline, phone, email, address, time zone (IANA, e.g. `Asia/Manila`), currency (ISO code), locale (e.g. `en-PH`), price note, reply time |
| `business.logo` | URL of the logo in Media Storage (see [section 7](#7-upload-images-and-assets)); leave empty to show the round initial |
| `theme` | `brand` (dark main colour), `accent` (button highlight), `canvas` (page background). Text colours on them are picked automatically for contrast. |
| `links` | The GHL page paths you create. Defaults match [section 4](#4-create-the-pages). `links.store` is the GHL store page, if you sell online. `links.staffLogin` is optional. |
| `nav`, `headerCta` | Menu items and the header button |
| `promo` | The thin banner above the header. **Set `enabled: false`** (or replace the sample text) before publishing. |
| `social` | Facebook, Instagram, etc. (empty = hidden) |
| `branches` | One entry per branch: id, name, address lines, phone, map URL, opening hours, and the branch's GHL calendar ([section 10](#10-connect-native-ghl-calendars)) |
| `services` | Each service: name, description, duration, price (or `priceLabel`), `bookable`, `enabled`, `featured` (shown on the home page). Services the business doesn't offer: set `enabled: false`. |
| `forms` | GHL form IDs ([section 9](#9-connect-native-ghl-forms)) |
| `faqs` | Questions shown on the home page (first 4) and the FAQ page |
| `testimonials` | **Real reviews only**, used with the customer's permission. Set `sample: false`. Or set `enabled: false` to hide the section. |
| `legal` | Privacy email, jurisdiction, last-updated date. Keep `draft: true` until a lawyer has reviewed Privacy and Terms. |
| `catalogue` | Categories, whether to show prices, the availability note |

The config is public browser code. **Never put API keys, tokens or private URLs in it.**

## 3. Build the global header and footer

Both are saved as **Universal** sections. They sync across every page, including store pages. A **Global** section syncs within this website only.

1. Open the home page in the builder. Add a **Section**:
   - full width;
   - top/bottom padding 0;
   - no background;
   - with one full-width row and column, padding 0.
2. Add a **Custom Code** element to it, then **Open code editor**. Paste `ghl-ready/site/B-header-section.html`, which holds the global CSS plus the header.
3. Select the section → **Save section** → type **Universal** → name it "OC Header".
4. At the bottom of the page, add a second section with the same settings. Paste `ghl-ready/site/C-footer-section.html` into its Custom Code element. That file is the footer + `OC_CONFIG` + the core script, so **re-generate it after editing the config** (`node tools/build-ghl.mjs`). Save it as Universal "OC Footer".
5. **Preview the page.** The header, footer and placeholders should look like `screenshots/desktop/home.png`.

**Sticky header:**
- GHL reports that sticky CSS works in preview mode *(unverified on published pages)*.
- If the header doesn't stay at the top on the published site, the section wrapper is clipping it. Leave it as a normal header in that case; the design works either way.

## 4. Create the pages

Create these pages: **Website → Pages → Add page**. Paths and SEO text are also in `pages/pages.json` and `ghl-ready/README.md`.

| Page | Path | SEO title | Notes |
|---|---|---|---|
| Home | `/` | {Business} — Eye care & eyewear | |
| Eyewear | `/eyewear` | Eyewear · {Business} | Showcase catalogue |
| Product | `/eyewear-item` | Eyewear · {Business} | One page for every product (`?p=<id>`). Not `/product`: GHL reserves `/product/` for store pages. |
| Services | `/services` | Services · {Business} | |
| Book | `/book` | Book an appointment · {Business} | Native calendar |
| Contact | `/contact` | Contact us · {Business} | Native form |
| About | `/about` | About us · {Business} | |
| FAQ | `/faq` | Frequently asked questions · {Business} | |
| Privacy | `/privacy` | Privacy notice · {Business} | Draft text, needs legal review |
| Terms | `/terms` | Terms of service · {Business} | Draft text, needs legal review |
| Booking confirmed | `/booking-confirmed` | You're booked in · {Business} | Custom meta tag `robots` = `noindex` |
| Thank you | `/thank-you` | Message received · {Business} | Custom meta tag `robots` = `noindex` |

**For every page:**

1. Insert the **OC Header** saved section at the top (Add elements → Saved sections).
2. For each `NN-*.html` file in `ghl-ready/pages/<page>/`, add a **section** (full width, padding 0, no background) with one **Custom Code** element. Paste the file into it, in file-number order.
3. If the folder has `00-page-custom-css.css`, open **page Settings (gear) → Custom CSS** and paste it.
4. If the folder has `99-page-script.html`, add one more section (padding 0) with a Custom Code element and paste it. This is the page's script; for Home, Eyewear and Product it also contains the catalogue data.
5. Insert the **OC Footer** saved section at the bottom.
6. **SEO:** open the SEO icon → SEO Meta Data and set the title and description. Optionally add a social image (1200×630).
7. **Save, then Preview.** Compare with `screenshots/desktop/<page>.png` and `screenshots/mobile/<page>.png`.

Page-specific instructions are in `pages/<page>/README.md`.

## 5. Where each code block goes (summary)

| Snippet | GHL location |
|---|---|
| `site/A-head-tracking-code.html` | Website Settings → Head tracking code |
| `site/B-header-section.html` | Custom Code element in the Universal header section |
| `site/C-footer-section.html` | Custom Code element in the Universal footer section |
| `pages/<page>/00-page-custom-css.css` | That page → Settings → Custom CSS |
| `pages/<page>/NN-*.html` | One Custom Code element per file, each in its own full-width section, in order |
| `pages/<page>/99-page-script.html` | Custom Code element in the last section before the footer |

**Section settings for every custom-code section:**
- full width;
- padding 0 on section, row and column;
- no background, border or shadow.

The code draws its own backgrounds and spacing.

## 6. Global styles and scripts

**Default — everything pasted:**
- The global CSS (`styles/oc-base.css`) is inside `B-header-section.html`.
- The business config and core script (`scripts/oc-config.js`, `scripts/oc-site.js`) are inside `C-footer-section.html`.
- Nothing else is needed.

**Hosted-files variant.** Use it if GHL truncates or rejects large code elements, or if you'd rather edit files than paste.

1. Upload the project folders `styles/`, `scripts/`, `pages/` and `assets/` to a static host you control (for example Cloudflare Pages, Netlify or GitHub Pages; all have free tiers).
   - GHL Media Storage accepts and serves `.css` files with a stable URL.
   - Whether it serves `.js` uploads correctly is *(unverified)*.
2. In `ghl-ready/hosted/`, replace `https://YOUR-FILE-HOST/optical-site/` with your folder URL.
3. Paste:
   - `hosted/A-head-tracking-code.html` → Head tracking code;
   - `hosted/B-body-tracking-code.html` → Body tracking code;
   - `hosted/C-header-section.html` and `hosted/D-footer-section.html` → the header and footer Custom Code elements;
   - `hosted/pages/<page>-footer-tracking-code.html` → each page's Settings → Tracking code → Footer.
   - Page CSS still goes in page Settings → Custom CSS.
4. After any config change, re-upload `scripts/oc-config.js`. Caches may take a few minutes.

## 7. Upload images and assets

1. **GHL → Media Storage:** create a folder (e.g. `optical-site`) and upload:
   - the logo;
   - `assets/products/*.svg` (or real product photos, ideally 1024×1024, under 200 KB for anything above the fold).
2. GHL serves media from its own domains (`storage.googleapis.com` / `assets.cdn.filesafe.space`), with a unique URL per file. Tell the site where each file lives in `OC_CONFIG.assets`, in one of two ways:
   - **Map each file:** `map: { "products/arden-101.svg": "https://assets.cdn.filesafe.space/…/abc.svg", … }`. Copy each link from Media Storage → ⋯ → Get link *(menu label unverified)*.
   - **One folder URL:** if you use the hosted-files variant, set `base: "https://YOUR-FILE-HOST/optical-site/assets/"` and the file names are kept.
3. Logo: `OC_CONFIG.business.logo = "<logo URL>"`. Favicon: website Settings (step 1).
4. With real product photos, put their paths or URLs in `scripts/oc-catalogue.js` (`image`, `images`, and optionally per-variant `image`).

## 8. Configure navigation

- The header menu, the mobile menu and the footer links all come from `OC_CONFIG.nav` (+ `headerCta`).
- The current page is highlighted automatically, and product pages count as **Eyewear**.
- Paths must match the GHL page paths exactly.
- To add a store link, add `{ label: "Shop", href: "/<your store products page path>" }` to `nav`.
- The native GHL Navigation Menu element isn't used. The custom header keeps the original design, and its mobile menu is keyboard-accessible.

## 9. Connect native GHL forms

All inquiries use a **native GHL form**. Submissions create or update the GHL contact (following the sub-account's de-duplication settings), and **the dashboard integration then syncs the contact as a lead.**

**a) Custom fields** (Settings → Custom Fields)

| Field | Type | Options / notes |
|---|---|---|
| Interest | Dropdown | Eye examination, Prescription glasses, Contact lenses, Sunglasses, Frames only, Repair / adjustment, Other |
| Preferred branch | Dropdown | No preference + one option per branch |
| Message | Multi-line text | |
| SMS consent | Checkbox | "You may text me about this enquiry" |
| Marketing consent | Checkbox | "Send me occasional offers and eye-care reminders" |
| Inquiry kind | Single line, **hidden** on the form | Query key `inquiry_kind` |
| Product name | Single line, **hidden** | Query key `product_name` |
| Source page | Single line, **hidden** | Query key `source_page` |

**b) Build the form "Website inquiry"** (Sites → Forms → Builder)

1. **Fields:** Full name (required), Email, Phone, Interest, Preferred branch, Message, the two consent checkboxes, and the three hidden fields.
   - Set each hidden field's **query key** exactly as in the table. Unique keys lock after the first save.
   - GHL can't express "email *or* phone required". Make **Phone** required (matches booking), or Email.
2. **Styles** (to match the site):
   - font Inter Tight;
   - labels 12.5px in `#5C5E63`;
   - input border `#D5D5CF`, radius 10px;
   - button background = your `theme.brand`, white text, fully rounded (pill).
   - Or paste custom CSS in Form → Advanced → Custom CSS.
3. **Spam:** enable GHL's captcha or spam protection.
4. **On submit → Redirect** to `/thank-you`, or show this message: "Thanks — we've got your message. We'll reply within one business day."
5. **Integrate → Embed → copy the embed code.**
   - From it, copy the **form ID**: the last part of the iframe `src`, `…/widget/form/<ID>`.
   - Set `OC_CONFIG.forms.contact = "<ID>"`. A full `src` URL also works, and is needed for white-label domains; you can also set `forms.widgetBase` to your domain.
6. **Optional:** a separate "Product inquiry" form → `OC_CONFIG.forms.product`. When empty, the contact form is reused.

**How the site uses it:**
- The Contact page and the product page's **Ask about this** panel load GHL's official inline form embed.
- They add `?inquiry_kind=…&product_name=…&source_page=…` to the form URL, so the hidden fields record what was asked about.
- Filling hidden fields from these URL keys is community-documented, not officially documented by GHL *(unverified; test it)*.
- Without an ID, a dashed **"GHL form" placeholder** appears. It never pretends to send anything.

**c) Workflow** (Automation → Workflows), recommended:

1. Trigger: Form submitted (Website inquiry).
2. Actions:
   - add the tag `website-inquiry` (+ `product-inquiry` when Inquiry kind = product_inquiry);
   - notify the team;
   - an optional auto-reply, **only when consent is ticked**.
3. The dashboard integration picks up the contact either through its marketplace webhooks or through the workflow webhook (dashboard **Settings → Integrations → GoHighLevel → Endpoints**).

**Alternative:** put a native **Form element** in a builder column instead of the code embed. On GHL pages the form reads the page's own URL keys *(unverified)*. You then lose the exact layout.

## 10. Connect native GHL calendars

**GHL is the source of truth for appointments.** The site never stores bookings itself.

**a) Recommended setup: one Service Menu calendar per branch** (Calendars → New → Service calendar). Add each bookable service (eye exam 45 min, contact lens consultation 30 min, frame & lens consultation 30 min), with staff assigned. Alternatives: one calendar per branch × service, or a Calendar Group.

**Calendar settings:**
- time zone = the business time zone;
- availability = branch hours;
- 30-minute slot interval;
- minimum notice 30 minutes;
- booking window about 21 days.

**Booking form:**
- name and phone required;
- email optional;
- "Anything we should know?";
- the SMS and marketing consent checkboxes (map them to the custom fields).

**Confirmation:** Advanced settings → Form & confirmation → **redirect to `/booking-confirmed`**. Online payment is off unless the business wants deposits.

**b) Connect each branch.** Calendar → ⋯ → **Share → Embed code**. Copy the iframe `src`, e.g. `https://api.leadconnectorhq.com/widget/booking/<ID>` (service menus and groups have their own widget URLs; any of them works). Paste it, or just the ID, into `OC_CONFIG.branches[i].calendar`.

**c) Per service (optional).** If a service has its own calendar at a branch, set `services[i].calendars = { "<branch id>": "<url or ID>" }`.

**How the site uses it:**
- The Book page lets the visitor choose a branch and a service, then loads GHL's official booking widget for that choice.
- Resolution order: service calendar for the branch → branch calendar → `booking.defaultCalendar`.
- Deep links `/book?branch=<id>&service=<id>` come from the home and services pages.
- Without a calendar, a labelled **"GHL calendar" placeholder** appears, and no booking is possible.

**Dashboard sync:**
- Bookings create the GHL contact and appointment and fire `AppointmentCreate`. The dashboard integration mirrors them once the calendar is **mapped to a branch and appointment type** (dashboard → Settings → Integrations → GoHighLevel → Mapping → Calendars).
- Decide the dashboard's *Appointments system of record* setting: with GHL calendars on the website, choose **GoHighLevel calendars**.
- **This sync hasn't been tested against a live sub-account.**

## 11. Products, stock and checkout

**Ground rules:**
- The **dashboard is the inventory source of truth**.
- When its GHL integration has *Products* and *Inventory* switched on, it publishes every product marked **Show in online store** to GHL Products ("Include in Online Store"), with one price per variant and the image. It pushes the **available quantity** after every stock change.
- GHL's native store then shows those products with live stock.
- A static web page can't show live GHL inventory, and GHL has **no public storefront API** for browser code. This site never calls the GHL or dashboard API from the browser.

**Choose one of two setups:**

**A. Showcase + native store for purchases (recommended for optical retail)**

- The Eyewear and Product pages (custom code) present the range in the original design. Customers ask about an item, book a fitting, or…
- …for items sold online, a **Buy online** button opens the product's **native store page** (`/product/<slug>`), with live stock, variants, cart and checkout.

Setup:
1. Sites → **Stores** → create the store. It adds the five fixed pages: Products list, Product details, Cart, Checkout, Thank you.
2. Connect a payment provider (Payments → Integrations), shipping zones and/or **Pickup in store**, and taxes (Payments → Settings).
3. Use the website's payment mode / the provider's **test mode** until you're ready.
4. For each product sold online, copy its link (Stores → Products → Copy link) into `scripts/oc-catalogue.js` as `"storeUrl": "/product/<slug>"`. Set `OC_CONFIG.links.store` to the store's products page.
5. Products without `storeUrl` stay "ask / reserve / try on" only.

**B. Native store first**

- Point the **Eyewear** menu item at the store's Products list page, and let the native Product details page handle every product.
- Style the store with the builder's own settings (typography, colours) to approximate the design. **This project's CSS deliberately never restyles native store elements.**

**Keeping the showcase in step with the dashboard:**
- Export products from the dashboard (Products → Export CSV), then run `node tools/catalogue-from-csv.mjs export.csv --previous=scripts/oc-catalogue.js --out=scripts/oc-catalogue.js`.
- Prices, variants and descriptions update. Images, featured order and `storeUrl` are kept.
- Then rebuild `ghl-ready` (`node tools/build-ghl.mjs`) and re-paste the page scripts. See `tools/README.md`.
- **The showcase never shows stock.** It says availability varies by branch.

**Known limitations** (documented, not hidden):
- **Stock is eventually consistent.** The dashboard sends GHL an **absolute** quantity after each change; GHL has no compare-and-set. A shop sale and an online sale seconds apart can race.
  - The dashboard's hourly reconciliation reports any drift. It never overwrites local stock.
  - Keep a small buffer, or turn off "continue selling when out of stock".
- **Out-of-stock display in GHL:**
  - Add-to-cart buttons on cards are hidden when all variants are out of stock, and those products sort last.
  - There's no configurable "sold out" badge *(per GHL docs)*.
- **Variants:** the dashboard publishes each variant as a separate GHL *price*. How the store groups those prices into variant options has **not been verified live**. Check it on the store's product page before launch.
- **Store URL slugs:** these are set by GHL, so copy them from GHL rather than guessing.
- **Online orders:** the dashboard imports paid GHL store orders once (stock deducted once), when its *Online orders* switch is on. **This hasn't been tested live.**

## 12. Configure custom values (optional)

Custom values (Settings → Custom Values) let non-technical staff change text without touching code.

- **Native text elements** (headlines, paragraphs, buttons, FAQ elements): use the builder's custom value picker. This is officially supported.
- **This project's config:** you *may* write values as merge tags, e.g. `phone: "{{custom_values.business_phone}}"`.
  - **Whether GHL replaces merge tags inside Custom Code elements or tracking code is not documented** *(unverified)*, and community reports suggest it doesn't.
  - If a tag isn't replaced, the site uses the built-in fallback text and logs a console warning. Visitors never see raw `{{…}}`.
  - Test one value before relying on it; otherwise keep plain text in the config.

## 13. Test the published website

Run this on a **test sub-account / test domain** first.

**Visual and layout**

- [ ] Each page in Preview and published, at phone (390px), tablet (768px), desktop and wide widths, matches `screenshots/`. No sideways scrolling, nothing clipped.
- [ ] Mobile menu: opens, closes (including with Escape), and every link works.
- [ ] Header, footer, branches, hours and services show the real business data; no Lensmere sample text remains.
- [ ] Promo banner disabled or real. Testimonials real (or hidden). Legal pages reviewed (`legal.draft: false`).

**Native GHL features — these can only be checked inside GHL**

- [ ] Contact form: submit a test inquiry → a contact is created/updated in GHL with Interest, Branch, Message, consents, and `inquiry_kind = contact`. The form redirects to `/thank-you`.
- [ ] Product inquiry ("Ask about this" on a product): the hidden **Product name** and `inquiry_kind = product_inquiry` arrive on the contact.
- [ ] Booking: each branch shows the right calendar. A test booking creates the appointment, sends the confirmation and redirects to `/booking-confirmed`. Cancel it afterwards.
- [ ] Store (if used): in **test mode**, buy a product with live stock → an order appears in Payments → Orders, stock goes down, and an out-of-stock product can't be added to the cart.

**Dashboard sync** (with the dashboard's GHL integration connected to this sub-account)

- [ ] The test inquiry appears as a lead in the dashboard.
- [ ] The test booking appears in the dashboard calendar (mapped calendar).
- [ ] The test store order is imported once, with stock deducted once.
- [ ] A stock change in the dashboard updates the GHL product quantity.

**Technical**

- [ ] Browser console: no errors. A warning about an unreplaced custom value means the merge tag isn't supported there; switch that value to plain text.
- [ ] Run Lighthouse (performance, accessibility, SEO) on Home and Eyewear, published, on mobile.
- [ ] SEO titles and descriptions set. Confirmation pages are `noindex`. Generate the XML sitemap (Settings → Domains → Manage → XML Sitemap).
- [ ] Old URLs: add **301 redirects** (Settings → URL Redirects) for any old addresses that were shared. Product URLs changed from `/eyewear/<uuid>` to `/eyewear-item?p=<id>`.
- [ ] Cookie banner configured if the business uses analytics or ads.
- [ ] Remove `noindex`, connect the domain, publish.

**Implementation checklist (short version)**

- [ ] 1. Website created; favicon; head tracking code; Optimize JavaScript off
- [ ] 2. `oc-config.js` edited (business, theme, branches, services, FAQs, legal, promo off) → `node tools/build-ghl.mjs`
- [ ] 3. Universal header + footer sections created
- [ ] 4. 12 pages created with blocks, page CSS, page script and SEO
- [ ] 7. Images uploaded; `assets.map` or `assets.base` and the logo set
- [ ] 9. Custom fields + "Website inquiry" form + workflow; `forms.contact` set
- [ ] 10. Calendars per branch; redirect to `/booking-confirmed`; `branches[].calendar` set; calendars mapped in the dashboard
- [ ] 11. Store (optional): products synced from the dashboard, payment/shipping/tax, test purchase, `storeUrl`s copied
- [ ] 13. Test checklist passed on the test sub-account; then the domain

---

## Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Page shows unstyled text | The header section (with the global CSS) is missing from this page, or the code element was truncated. Re-insert OC Header, or use the hosted-files variant. |
| Lists (services, branches, products) are empty | The footer section (config + core script) or the page script is missing; or *Optimize JavaScript* is on. Check the console for `[OCSite]` messages. |
| Everything looks right in Preview but not in the editor | Expected: GHL doesn't run code in the editor canvas. |
| A dashed "GHL form" / "GHL calendar" box appears on the live site | The form or calendar ID isn't set in `OC_CONFIG` (or the config wasn't re-pasted after editing). |
| Styles fight with GHL's | GHL writes some element styles with `!important`. This project's selectors are scoped under `.oc` and never target native elements. Don't put the custom-code blocks inside sections with their own typography settings. |
| Product page says "Choose a frame…" | The page was opened without `?p=<product id>`. Links from the catalogue include it. |

## Appendix A — GHL behaviours this design relies on

Researched 2026-10-16 from help.gohighlevel.com, ideas.gohighlevel.com and the marketplace docs. Not tested in a live account.

| Behaviour | Status |
|---|---|
| Custom Code element renders into the page (not an iframe); scripts run; shows in Preview and live, not in the editor canvas | Official articles (inferred) + community |
| Wait for the `hydrationDone` event before manipulating the page; `oc-site.js` also re-renders on it | Official |
| "Optimize JavaScript" delays scripts until interaction | Official |
| Scripts nested inside a `<div>` in a code element don't run | Official (2022 article, since removed) |
| No website-level Custom CSS field; page-level Custom CSS exists | Official (field not listed) / community |
| Head tracking code injected client-side; possible ~2,500-character limit | Official / one community report |
| Universal sections sync across websites and store pages | Official |
| Form and calendar embed codes (iframe + `form_embed.js`); multiple calendars via embed in a code element | Official |
| Hidden form fields filled from URL query keys | Community only |
| Custom values in Custom Code elements or tracking code | Undocumented |
| Store: five fixed pages; `/product/<slug>` product URLs; no storefront or cart JS API; out-of-stock hides buttons | Official / community (cart API request open) |
| `availableInStore` = "Include in Online Store"; inventory fields on the price | Official |
| Store purchases create orders and fire `OrderCreate`; bookings fire `AppointmentCreate` | Official (webhook docs) |
| Media served from GHL domains; SVG/WebP accepted up to 100 MB | Official |
