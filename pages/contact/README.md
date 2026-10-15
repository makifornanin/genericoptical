# Contact — `/contact`

- **SEO title:** Contact us · {Business}
- **SEO description:** Questions about eye exams, glasses, contact lenses or an order? Send us a message or call a branch.
- **Reference:** `screenshots/desktop/contact.png`

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-intro.html` | Page intro (reply time from `business.replyTime`) |
| 2 | `blocks/02-contact.html` | Left: **native GHL inquiry form** + privacy/routing note. Right: phone, email, and each branch (address, phone, hours) |
| — | `99-page-script.html` | `contact.js` (branch list) |
| — | OC Footer | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## Form

- **Embed:** `OC_CONFIG.forms.contact` (ID or embed URL), loaded with GHL's official inline form embed. It adds `inquiry_kind=contact` and `source_page=/contact` for the hidden fields.
- **Placeholder:** without an ID, a dashed **"GHL form"** box lists the expected fields; nothing is sent.
- **Form design and settings:** guide §9 covers the fields, styles, spam protection, the redirect to `/thank-you` and the workflow.

## Routing

- Submissions create or update the GHL contact. Use a workflow on the **Preferred branch** field to notify that branch, or to assign an owner.
- The dashboard integration syncs the contact as a lead (not tested against a live sub-account).
- **Alternative:** a native Form element in a two-column builder row (left column) + this block's right half. You keep native-only form features but lose the exact card styling.
