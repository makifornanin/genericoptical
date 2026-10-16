# Privacy — `/privacy`

- **SEO title:** Privacy notice · {Business}
- **SEO description:** What personal information we collect, why we use it, who can see it and your rights.
- **Reference:** `screenshots/desktop/privacy.png`

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-privacy.html` | Privacy notice with a sticky "On this page" list (desktop) and 7 numbered sections |
| — | OC Footer | |

No page CSS or script. The legal layout styles are in the global CSS, and the bindings run from the core script.

## ⚠ Draft legal text

- **What it is:** plain-language **sample text**. It must be reviewed for the business and its jurisdiction before publishing.
- **The notice:** while `OC_CONFIG.legal.draft` is `true`, a visible "Draft — needs legal review" notice is shown. Set it to `false` only after review.
- **Filled in from the config:** the legal name (`business.legalName`), privacy email (`legal.privacyEmail`), jurisdiction (`legal.jurisdiction`) and "last updated" (`legal.lastUpdated`).
- **What the draft covers:** what's collected (including clinical data), why, online forms and bookings (processed by the business's communications platform), access, retention, cookies and rights.
- **Changes for the reviewer to consider:** add details such as data-protection officer contact, cross-border transfers or analytics vendors, as the business's situation requires.
