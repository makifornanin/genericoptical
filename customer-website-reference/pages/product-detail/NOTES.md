# Product detail — `/eyewear/[id]`

| | |
|---|---|
| Original source | `src/app/(site)/eyewear/[id]/page.tsx` → `source/page.tsx` (verbatim) |
| Shared components used | `Container`, `Eyebrow`, `ProductArt` (`site-ui.tsx`); `InquiryForm` (`inquiry-form.tsx`) |
| Data | `getSite()` + `getShowcase(biz.id)`; the product is found by its UUID in the showcase list (non-UUID or unknown ids → Next.js 404 via `notFound()`). Related = up to 4 other products in the same category. |
| Backend action | `submitInquiryAction` (`actions.ts`) → `capturePublicLead()` — creates or updates a Lead with `kind: "product_inquiry"` and `productName`. |
| `<title>` | product name, e.g. `Arden 101 · Lensmere Optical` |
| Meta description | product description, else "{name} — {category}" (e.g. "Hand-polished acetate rectangle frame. Available in black, tortoise.") |
| Captured example | `/eyewear/23049647-22cf-4cb9-9663-6cfc530f5159` = **Arden 101** (first product link on `/eyewear`) |
| Screenshots | `screenshots/product-detail-desktop.png`, `product-detail-mobile.png` |
| Standalone | `standalone/product-detail.html` (one sample page; in the original there is one URL per product) |

## Sections, top to bottom

### 1. Back link
"← All eyewear" → `/eyewear` (13.5px, grey, darkens on hover).

### 2. Product layout (two columns)
- **Left:** large 4:3 illustration, radius 28px.
- **Right:**
  - Eyebrow "Brand · Category" (e.g. "Arden · Frames").
  - H1 product name (38px → 46px at ≥ 640px).
  - Price in the display font, 24px: "from ₱2,950.00" when several variants (the "from" is 16px grey), otherwise just the price.
  - Description paragraph (from the product record).
  - "Available in" + pill chips, one per variant label (e.g. "52 · Black", "54 · Tortoise"; sunglasses "Smoke lens"; contact lenses "Power -1.00").
  - Note: "Stock differs by branch. Send us a note and we'll confirm availability, or reserve it for a try-on."
  - **Inquiry form** (see `../../components/COMPONENTS.md` → InquiryForm) in product mode: interest preselected from the category (frames → "Frames only", sunglasses → "Sunglasses", contact lenses → "Contact lenses", anything else → "Other"); message prefilled "I'd like to know more about {product}."; submit label **"Ask about this"**; sends hidden `kind = product_inquiry` and `productName`.
- **Responsive:** stacked < 1024px (image first); `1.2fr / 1fr` with 56px gap ≥ 1024px.

### 3. "More {category}" — related products
H2 "More frames" (category lower-cased), then up to 4 cards (image, name, price — no "from"). 2 columns < 768px, 4 columns ≥ 768px. Top hairline, 96px top margin. Hidden when there are no related products.

## Interactions
- Inquiry form is a client component; on submit it calls the server action (HTTP POST to the page with a `Next-Action` header). Success replaces the form with "Thanks, {first name}." + "We've received your message…" + "Send another message". Errors show inline under fields / in a red box. A hidden honeypot field `website` silently drops bot submissions; the server rate-limits to 8 inquiries per IP per 10 minutes.
- Validation (`publicLeadInput` in `src/lib/schemas.ts`): full name required (≤ 120), email OR phone required ("Add an email address or phone number so we can reply."), message ≤ 2000.
