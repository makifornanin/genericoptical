# GoHighLevel migration guide

How to rebuild the Lensmere Optical customer website (Next.js, `src/app/(site)/`) in the GoHighLevel (GHL) website builder. Read with `MANIFEST.md`, the per-page `pages/*/NOTES.md`, and the visual references in `standalone/` and `screenshots/`.

> Lensmere Optical is the **fictional demo business**. Replace every name, address, phone number, price and FAQ with the real business's data before publishing, and remove the demo banner and `noindex` once the content is real.

## 1. Classification legend

| Code | Meaning |
|---|---|
| **(a)** | Native GHL website-builder elements (Section / Row / Column, Headline, Paragraph, Image, Button, Nav menu, FAQ, Divider, Icon) |
| **(b)** | Needs custom HTML/CSS/JS — paste the matching block from `standalone/*.html` + `standalone/site.css` (+ `site.js`) into a GHL **Custom Code / HTML** element |
| **(c)** | Needs a **GHL Form** (Sites → Forms → Builder), embedded with the Form element |
| **(d)** | Needs a **GHL Calendar** booking widget (Calendars → Calendar settings → embed / Calendar element) |
| **(e)** | Depended on **our backend** (PostgreSQL via `site-data.ts`, server actions in `actions.ts`) — the content was live data; in GHL it must be typed in by hand, managed in a GHL feature (Products/Store, Calendars, Forms) or synced through the GHL API |
| **(f)** | **Cannot be transferred directly** — closest alternative given |

Sections often combine codes, e.g. "(a) + (e)" = build with native elements, but the content used to be live data and now needs manual upkeep.

## 2. Section-by-section classification

### Global (every page)

| Section | Code | How to rebuild in GHL |
|---|---|---|
| Fonts (Inter Tight body, Instrument Sans 600 headings) | (a) | Site settings → Typography: both are Google Fonts. Headings Instrument Sans 600, letter-spacing −0.02em if the theme allows (otherwise add the `.display` rule from `site.css` to the site-wide custom CSS). |
| Colours / brand variables | (a) + (e) | Site settings → Colours: Primary `#1F2B22`, Accent `#B5E14A`, Text `#18191B`, Body text `#5C5E63`, Muted `#86888D`, Background `#F6F6F3`, Surface `#FFFFFF`, Border `#E7E7E2`. In the app these came from Settings → Branding with auto-computed text colours (`brandVars()`); in GHL choose white vs. ink text per button yourself. See `styles/tokens.md`. |
| Demo banner | (a) or drop | Only shown because the business is a demo. Omit for the real site (or a full-width dark Section with a Text element). |
| Sticky header: logo mark/name/tagline, nav (Eyewear, Services, About, FAQ, Contact), "Book an exam" | (a) | Header section + Nav Menu element + Button (link to the booking page). Enable "sticky header". Use the real logo image instead of the round initial. Active-page pill styling is optional custom CSS (`.main-nav a[aria-current]` in `site.css` §4). |
| Mobile hamburger menu | (a) | GHL's nav element collapses to a hamburger automatically. (`site.js` §1 is only for the standalone file.) |
| Footer: name, tagline, phone, email, address, "Book an eye exam" pill, 3 branch columns with hours, footer links, © line | (a) + (e) | Footer section, 4 columns. Branch addresses and hours were read from the branches table — type them in and update them whenever hours change. "Staff sign in" pointed to the Next.js dashboard — remove it or link to the app's `/login`. Copyright year: type it or use GHL's dynamic year if available. |
| `<title>` template, meta description, Open Graph site name | (a) | Each page's SEO settings (see §6). |
| `noindex, nofollow` (demo only) | (a) | Page/site SEO settings → "hide from search engines" while the content is demo data. |
| Favicon | (a) | Site settings → Favicon: `assets/favicon.ico`. |
| `robots.txt` / `sitemap.xml` (`src/app/robots.ts`, `sitemap.ts`) | (f) | GHL generates its own sitemap and robots for published sites; the dynamic per-product sitemap and the `/app` disallow rules don't apply. |

### Home (`/` → `standalone/index.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Hero copy: eyebrow, H1, paragraph, 2 buttons | (a) + (e) | 2-column Section; copy came from Settings → Website (`heroEyebrow/heroTitle/heroBody`) — type it in. Buttons → booking page and products page. |
| Hero stats strip (Branches 3 · Frames & eyewear 27 · Eye exam 45 min) | (a) + (e) | 3-column Row of Text elements in a white bordered box (or the `.hero-stats` block, (b)). Numbers were counted live from the DB — update by hand or drop. |
| Hero product images (3) | (a) + (e) | Image elements (`assets/products/frame-rectangle-black.svg`, `frame-round-tortoise.svg`, `sun-round-smoke.svg`) on `#EFEEE8` rounded boxes, linking to product pages. Picked automatically from the catalogue originally. |
| 01 Services rows | (a) + (e) (+ (b) for the exact 5-column row) | Rows of Text (number, name + description, duration, price, "Book ↗"). Content came from appointment types — keep in sync with the GHL calendars (§4). Each "Book" → that service's calendar/booking page. |
| 02 Eyewear: 8 featured products | (a) + (e), or GHL Store element | Static: 4-column grid of Image + Text. Store: GHL "Products"/collection element if the catalogue moves to GHL Products (§5). |
| 03 Our approach + 4 values | (a) | Headline/Paragraph + 4-column Row of white cards (copy from Settings → Website). |
| 04 Visit us: branch cards | (a) + (e) | 3 cards (Text + Icon + Buttons). "Book here" → that branch's calendar. |
| └ Live "Open / Closed · opens …" badge | (f) | No native equivalent (it was computed per request in Asia/Manila time). Drop it, or paste the badge markup + `site.js` §2 (`openStatus`) as custom code (b). |
| CTA panel (dark, "Book your next eye exam online.", 2 buttons) | (a) | Section with brand background, 28px radius column, Headline/Paragraph/2 Buttons (accent + outline-white). |
| FAQ teaser (first 4 FAQs) | (a) or (b) | GHL FAQ element, or the `<details>` block from `index.html` (no JS needed). FAQs came from Settings → Website — keep in sync with the FAQ page. |

### About (`/about` → `standalone/about.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Hero: eyebrow, H1 "It starts with listening.", story paragraph | (a) + (e) | 2-column Section; copy from Settings → Website. |
| 01 How we work (4 values) | (a) | 2-column Rows of numbered Text blocks with a top divider. |
| 02 Our branches + "Book a visit" | (a) + (e) | 3-column bordered Row; button → booking page (d). Branch data typed in. |

### Products / eyewear listing (`/eyewear` → `standalone/products.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Page intro | (a) | Section: eyebrow, H1, paragraph. |
| Category pills with counts | (e) → Store categories, or (b)/(f) | With GHL Store: collections Frames / Sunglasses / Contact lenses. Static: separate pages per category, or keep the pill bar + `site.js` §3 filter as custom code. Counts were live — drop them or update by hand. |
| Product grid (32 products: image, name, brand · category, "from" price, "N options") | (e) | Either GHL Store product list (recommended for upkeep, §5) or a hand-built grid of Image + Text (data in `pages/products/content.md`). |
| Price footnote ("Prices include VAT …") | (a) | Paragraph. |

### Product detail (`/eyewear/[id]` → `standalone/product-detail.html`)

| Section | Code | How to rebuild |
|---|---|---|
| "← All eyewear" link | (a) | Text link / Button. |
| Image, brand · category, name, price, description, "Available in" chips | (e) | GHL Store product page (variants = options), or one static page per product from this template. 32 URLs originally, one per product UUID. |
| Stock note | (a) | Paragraph. |
| Product inquiry form ("Ask about this") | (c) + (e) | GHL Form (§3) with hidden fields `Inquiry kind = product_inquiry` and `Product name` (prefill via URL query `?product_name=Arden%20101`). Originally posted to `submitInquiryAction` → created a Lead in our DB. Interest preselected from the category (frames → "Frames only", sunglasses → "Sunglasses", contact lenses → "Contact lenses"): use a query-string default or a separate form per category. |
| "More frames" related products | (e) | Store related-products block, or 4 hand-picked Image + Text cards. |

### Services (`/services` → `standalone/services.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Page intro | (a) | Section. |
| 01 Appointments: 3 service cards (name, price, duration, description, "Book this") | (a) + (e) → (d) | 2-column cards; each button → that service's calendar. Keep prices/durations identical to the calendar settings. |
| 02 Prescription lenses / 03 In-branch services price lists | (e), not rendered | Only appear when catalogue items of those kinds are published; none are in the demo. Add as a native price-list section if wanted. |

### Booking (`/book` → `standalone/booking.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Intro (eyebrow, H1, paragraph) | (a) | Section. |
| Booking picker: branch → service → 21-day date strip → live time slots → details → "Request appointment" | (d) + (e) | Replace the **whole card** with a GHL calendar widget (§4). Slots came from `publicSlotsAction` → `availableSlots()` and bookings from `bookAppointmentAction` → `requestPublicAppointment()` (created the appointment and lead in our DB). Branch choice: either a branch picker page linking to per-branch calendars, or one "service menu"/group calendar per branch. |
| Deep links `?branch=<id>` / `?type=<id>` | (f) | Use direct links to the specific GHL calendar (or calendar + service) instead. |
| Success state ("You're booked in.") | (d) | GHL calendar confirmation screen or a redirect to a thank-you page with the same copy. |
| Aside: How it works · Opening hours · Prefer to call? | (a) + (e) | Text elements beside the widget; hours/phone typed in. |

### Contact (`/contact` → `standalone/contact.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Page intro | (a) | Section. |
| Inquiry form | (c) + (e) | GHL Form (§3), `Inquiry kind = contact`, interest default "Other". |
| Reach us directly + branch list | (a) + (e) | Icon + Text rows (phone, email, each branch address and phone). |

### FAQ (`/faq` → `standalone/faq.html`)

| Section | Code | How to rebuild |
|---|---|---|
| Page intro | (a) | Section. |
| 6 FAQs, first open | (a) or (b) + (e) | GHL FAQ element, or the `<details>` block (no JS). FAQs came from Settings → Website. |
| FAQPage JSON-LD | (b) | Paste the `<script type="application/ld+json">` from `faq.html` into the page's head/tracking code; keep it in sync with the visible FAQs. |
| "Still have a question?" card | (a) | Bordered column with Headline, Paragraph, Button → contact page. |

### Privacy (`/privacy`) and Terms (`/terms`) → `standalone/privacy.html`, `terms.html`

| Section | Code | How to rebuild |
|---|---|---|
| Sticky "On this page" sidebar (desktop) | (b) or (f) | No native sticky TOC — paste the `.legal__toc` markup + CSS, or omit it. |
| Eyebrow, H1, intro, numbered sections | (a) + (e) | Headline + Paragraph/List elements. Legal name, privacy email, currency, tax wording, email and phone were filled in from Settings — type them in. Have both documents legally reviewed (Philippine Data Privacy Act of 2012) before going live. |

## 3. GHL form — inquiry form (Contact page and product pages)

Original: `components/inquiry-form.tsx` → `submitInquiryAction` → `capturePublicLead()`; validation `publicLeadInput` in `components/supporting/lib/schemas.ts`.

### Fields (in display order)

| # | Label (exact copy) | GHL field | Type | Required | Notes |
|---|---|---|---|---|---|
| 1 | Full name | Standard **Full Name** (splits into First/Last; our backend also split on the first space) | Single line | Yes | max 120 chars |
| 2 | Email | Standard **Email** | Email | See note | |
| 3 | Mobile number | Standard **Phone** | Phone | See note | Help text: "Email or mobile — whichever you prefer." Default country PH (+63). |
| 4 | I'm interested in | Custom field **Interest** | Dropdown (single) | No (default "Other") | Options below |
| 5 | Preferred branch | Custom field **Preferred branch** | Dropdown (single) | No | Options: `No preference`, `Makati`, `Quezon City`, `Pasig` (one per real branch) |
| 6 | Message | Custom field **Message** (or GHL's default message/notes field) | Multi-line text | No | max 2000 chars; product pages prefill "I'd like to know more about {product}." |
| 7 | You may text me about this enquiry | Custom field **SMS consent** | Checkbox (single option) | No | Stored as `smsConsent` originally. Consider also GHL's native SMS-consent element for A2P/compliance. |
| 8 | Send me occasional offers and eye-care reminders | Custom field **Marketing consent** | Checkbox (single option) | No | `marketingConsent`. Drive marketing workflows only when ticked. |
| – | (hidden) Inquiry kind | Custom field **Inquiry kind** | Hidden | – | `contact` on the Contact page, `product_inquiry` on product pages (original also allowed `appointment_request`) |
| – | (hidden) Product name | Custom field **Product name** | Hidden, query key `product_name` | – | Product pages only |
| – | (hidden) Lead source | Contact source / tag | Hidden | – | `website` (original `source: "website"`) |

Footer note under the form: "We use your details only to reply to you. See our privacy notice." (link to the privacy page). Submit labels: **Send message** (contact) / **Ask about this** (product). Success copy: "Thanks, {first name}. We've received your message and a member of our team will get back to you, usually within one business day." — set as the form's thank-you message.

### "I'm interested in" — exact option values (`LEAD_INTERESTS` / `LEAD_INTEREST_LABELS`)

| Stored value (our DB) | Label to show in GHL |
|---|---|
| `eye_exam` | Eye examination |
| `prescription_glasses` | Prescription glasses |
| `contact_lenses` | Contact lenses |
| `sunglasses` | Sunglasses |
| `frames` | Frames only |
| `repair` | Repair / adjustment |
| `other` | Other (default) |

GHL dropdowns store the option text; if the GHL contact is later synced back to our platform, map label → value with this table.

### Behaviour differences to handle
- **"Email OR mobile required"** (original error: "Add an email address or phone number so we can reply.") cannot be expressed natively in GHL forms. Either make **Phone** required (matches the booking form) or Email required, or keep both optional and add a custom-JS check.
- **Spam:** the original used a hidden honeypot (`website`) + rate limit (8/IP/10 min). Use GHL's built-in captcha/spam protection instead.
- **De-duplication:** the original attached a repeat submission (same email/phone within 30 days, lead still open) to the existing lead as an "inquiry" activity and OR-ed the consents. GHL de-duplicates contacts by email/phone; add a workflow: Form submitted → add tag `website-inquiry` (+ `product-inquiry` when kind = product_inquiry) → create/assign Opportunity in a "Website leads" pipeline (stage "New lead") → internal notification → optional SMS/email auto-reply (only if consent ticked).

## 4. GHL calendars — booking

Original rules (`availableSlots()` / `requestPublicAppointment()`, see `pages/booking/NOTES.md`): 30-minute slot steps inside opening hours, appointment must end by closing, no start sooner than 30 minutes from now, 21-day booking window, eye exams/fittings need a free practitioner at that branch, consultation needs none; booking requires name + phone (≥ 6 chars), email optional; created appointments were "scheduled" requests confirmed later by staff ("We'll contact you to confirm").

### Recommended calendars: one per branch × public appointment type (9)

| Calendar name | Branch | Duration | Price shown (no online payment originally) | Team / assignment |
|---|---|---|---|---|
| Makati — Comprehensive eye exam | Makati | 45 min | ₱500.00 | Optometrist(s) of Makati (demo: Dr. Elise Navarro), round robin |
| Makati — Contact lens fitting | Makati | 30 min | ₱800.00 | Makati optometrist(s) |
| Makati — Frame & lens consultation | Makati | 30 min | Price on request | Any Makati staff (no practitioner required) |
| Quezon City — Comprehensive eye exam | Quezon City | 45 min | ₱500.00 | QC optometrist(s) (demo: Dr. Miguel Tan) |
| Quezon City — Contact lens fitting | Quezon City | 30 min | ₱800.00 | QC optometrist(s) |
| Quezon City — Frame & lens consultation | Quezon City | 30 min | Price on request | Any QC staff |
| Pasig — Comprehensive eye exam | Pasig | 45 min | ₱500.00 | Pasig optometrist(s) (demo: Dr. Rina Bautista) |
| Pasig — Contact lens fitting | Pasig | 30 min | ₱800.00 | Pasig optometrist(s) |
| Pasig — Frame & lens consultation | Pasig | 30 min | Price on request | Any Pasig staff |

(The demo also has two **non-public** types — Follow-up check 20 min and Eyewear pickup & fitting 15 min — that are not bookable online; create them as internal calendars only if staff need them.)

Settings for every calendar:
- **Time zone:** Asia/Manila.
- **Availability:** Mon–Sat 10:00–19:00, Sun 11:00–17:00 (per-branch overrides if a branch keeps different hours).
- **Slot interval:** 30 minutes; **duration** as above (so the last 45-min exam starts 18:00).
- **Minimum scheduling notice:** 30 minutes. **Date range:** 21 days into the future.
- **Buffer:** none in the original (the platform setting `defaultAppointmentBufferMinutes` exists but isn't used by the public slot logic).
- **Booking form fields:** Full name (required), Phone (required), Email (optional), "Anything we should know?" (multi-line, placeholder "e.g. current glasses, symptoms, contact lens history"), checkbox "Text me appointment reminders" (→ SMS consent), checkbox "Send me occasional offers and eye-care reminders" (→ Marketing consent).
- **Confirmation:** "You're booked in." / "We'll contact you to confirm. If you need to change it, just call the branch." Consider auto-confirm off (status "unconfirmed") to mirror the original request-then-confirm flow.
- **Payments:** off (the original never took payment online).

Simpler alternatives: one calendar per branch using GHL's service menu (3 services each), or one calendar per service with the branch chosen as a team/location. Whatever you choose, link the site's "Book here" (branch) and "Book this" (service) buttons to the matching calendar URL — that replaces the `?branch=` / `?type=` deep links.

Platform note: `src/lib/types.ts` defines `BusinessSettings.appointmentsAuthority: "platform" | "ghl"` ("who owns appointment records when GoHighLevel calendars are connected"). Decide that setting before go-live so bookings made in GHL calendars reach (or are owned by) the right system.

## 5. Product listings

The original catalogue is live data: 32 products (20 frames, 7 sunglasses, 5 contact lenses), each with variants (size · colour, lens colour, or power), lowest price shown as "from …", SVG illustrations, a detail page with an inquiry form and related products. No cart or checkout — products are "try in branch / ask about this".

| Option | Effort / upkeep | Fit |
|---|---|---|
| **A. GHL Store / Products** (Payments → Products; Sites → Store) | Medium setup, easy upkeep. Create collections Frames / Sunglasses / Contact lenses; one product per item with variants as options; currency PHP; images from `assets/products/`. Hide or disable "Add to cart"/checkout and add an "Ask about this" button linking to the inquiry form with `?product_name=`. | Recommended if the catalogue changes or exceeds ~10 items. |
| **B. Static pages** | Hand-build the listing grid (data in `pages/products/content.md`) and one detail page per product from `standalone/product-detail.html`. | Fine for a short, rarely-changing featured selection; becomes stale quickly. |
| **C. Custom-code grid fed by JSON** | Paste the grid + filter (`site.js` §3) into a custom-code element; maintain a JSON list. | Middle ground; still manual. |
| **D. Sync from our platform via the GHL API** | Engineering work (products + variants + prices). | Only if the platform remains the source of truth for inventory. |

Prices were "including VAT" (business setting) — keep the footnote. Lens prices were never shown publicly in the demo.

## 6. SEO notes

| Page | Original `<title>` | Original meta description | Suggested GHL slug |
|---|---|---|---|
| Home | Lensmere Optical — Eye care & eyewear | Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches — with optometrists who take the time to explain your options. | `/` |
| About | About us · Lensmere Optical | _(inherits the home description)_ | `/about` |
| Products | Eyewear · Lensmere Optical | Prescription frames, sunglasses, contact lenses and eye-care essentials. | `/eyewear` |
| Product detail | {Product name} · Lensmere Optical (e.g. Arden 101 · Lensmere Optical) | {Product description}, else "{name} — {category}" | `/eyewear/<product-slug>` (original used UUIDs) |
| Services | Services · Lensmere Optical | Eye examinations, contact lens fittings, eyewear fitting and aftercare. | `/services` |
| Booking | Book an appointment · Lensmere Optical | Book an eye examination or contact lens fitting online. | `/book` |
| Contact | Contact us · Lensmere Optical | Questions about eye exams, glasses, contact lenses or an order? Send us a message. | `/contact` |
| FAQ | Frequently asked questions · Lensmere Optical | _(inherits the home description)_ | `/faq` |
| Privacy | Privacy notice · Lensmere Optical | _(inherits the home description)_ | `/privacy` |
| Terms | Terms of service · Lensmere Optical | _(inherits the home description)_ | `/terms` |

- Title pattern: `{Page} · {Business}`; home = `{Business} — {Tagline}`. Give About/FAQ/Privacy/Terms their own descriptions in GHL (they inherited the home one).
- **Demo = noindex:** the original emitted `robots: noindex, nofollow` and an empty sitemap for demo businesses. Keep the GHL site hidden from search engines until real content replaces Lensmere's.
- Open Graph: `og:site_name` = business name, `og:type` = website (add a share image in GHL; the original had none).
- FAQ structured data: paste the FAQPage JSON-LD (see FAQ row above).
- Keep the same paths (`/eyewear`, `/services`, `/book`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`) or add 301 redirects from them when the domain moves to GHL. Product URLs change (UUID → slug) — redirect any that were shared.
- One H1 per page is already the case in the references; headings are semantic (H1 → H2 → H3).

## 7. Cannot be transferred directly — summary (f)

| Original capability | Closest GHL alternative |
|---|---|
| Live open/closed badge per branch (server-computed in Asia/Manila) | Drop, or `site.js` §2 in a custom-code element |
| Catalogue, branch, hours, FAQ and copy pulled live from the database / Settings → Website | Manual content in GHL; GHL Store for products; or API sync |
| Auto-picked featured products and live counts (Branches / Frames & eyewear / exam duration) | Hand-picked, typed numbers |
| Slot availability computed from our appointments table and practitioner assignments | GHL calendar availability + team members (double-booking with appointments created in our dashboard is only prevented if calendars are synced — see `appointmentsAuthority`) |
| `?branch=` / `?type=` booking deep links | Direct links to specific calendars |
| Lead de-dup/merge rules, honeypot, per-IP rate limits | GHL contact de-dup, captcha, workflows |
| "Email or phone required" validation | Make one of them required, or custom JS |
| Dynamic sitemap with product URLs, robots disallow rules | GHL's generated sitemap/robots |
| Sticky legal table of contents | Custom code (b) or omit |

## 8. Step-by-step rebuild checklist

1. **Collect real content:** business name, legal name, tagline, logo, brand + accent colours, phone, email, address, branches (address, phone, hours), services (name, duration, price, description), FAQs, about copy, values, product list. Use the `content.md` files as the template.
2. **Create the GHL site** (Sites → Websites), set the domain later. Upload the favicon and logo; set global colours and fonts (§2 Global, `styles/tokens.md`); paste `standalone/site.css` sections you will reuse into the site-wide custom CSS (optional).
3. **Build the header and footer** as global sections (nav: Eyewear, Services, About, FAQ, Contact; button "Book an exam"; footer with contact details, branch hours, Privacy/Terms links).
4. **Create custom fields** (Settings → Custom Fields): Interest (dropdown, 7 options in §3), Preferred branch (dropdown), Message (multi-line), SMS consent (checkbox), Marketing consent (checkbox), Inquiry kind (text, hidden), Product name (text, hidden).
5. **Build the inquiry form** (§3) with the thank-you message; create the "Website inquiry" workflow (tags, opportunity, notifications, consent-aware auto-reply).
6. **Create the calendars** (§4): 9 calendars (3 branches × 3 services) or 3 service-menu calendars; add optometrists as team members; set Asia/Manila, hours, 30-min interval, 30-min notice, 21-day window, booking form fields, confirmation copy; payments off. Decide `appointmentsAuthority` with engineering.
7. **Decide the product approach** (§5). For GHL Store: create collections and 32 products with variants and images from `assets/products/`; disable checkout; add "Ask about this" links with `?product_name=`.
8. **Build pages** in this order, using `standalone/*.html` + `screenshots/*.png` as the visual reference and `pages/*/content.md` for copy: Home, Services, Booking (embed calendars), Eyewear listing, Product detail template, About, Contact (embed form), FAQ (FAQ element + JSON-LD), Privacy, Terms.
9. **Wire every link:** "Book an exam/eye exam/appointment" → booking page; "Book here" → branch calendar; "Book this"/"Book ↗" → service calendar; "Ask a question"/"Contact us" → contact page; product cards → product pages.
10. **SEO** (§6): titles, descriptions, OG image, FAQ JSON-LD, noindex while demo content remains, 301 redirects for old URLs.
11. **Legal review** of Privacy and Terms for the business's jurisdiction; replace demo legal name and contact emails.
12. **QA** at 1440px and 390px against `screenshots/`: no horizontal scrolling (the original booking page had a horizontal-overflow bug — make sure the GHL calendar embed doesn't reintroduce one), forms submit into GHL contacts with the right custom fields, test bookings land on the right calendar/team member, mobile menu works, all links resolve.
13. **Go live:** remove the demo banner, remove noindex, connect the domain, then let engineering remove the public routes from the Next.js app.
