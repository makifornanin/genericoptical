# About — `/about`

- **SEO title:** About us · {Business}
- **SEO description:** How we work: thorough exams, honest guidance, made-to-measure lenses and aftercare included.
- **Reference:** `screenshots/desktop/about.png`

## Sections

| # | Paste | What it is | Content |
|---|---|---|---|
| — | OC Header | | |
| 1 | `blocks/01-hero.html` | "About {Business}" + headline + story | Static copy; name from `business.name` |
| 2 | `blocks/02-how-we-work.html` | "01 What to expect": four numbered points | Static copy |
| 3 | `blocks/03-branches.html` | "02 Where to find us": branch strip with address, phone and grouped hours; "Book a visit" | `OC_CONFIG.branches` |
| — | `99-page-script.html` | `about.js` | |
| — | OC Footer | | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

The story and the four points are good candidates to rebuild as **native GHL text elements**, so staff can edit them in the builder: a headline, a paragraph and a 2×2 grid. Keep the block's spacing: 80px section padding, a 1px divider line above each item.
