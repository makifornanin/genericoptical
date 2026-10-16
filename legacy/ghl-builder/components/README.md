# Global components

| File | GHL location | Content from |
|---|---|---|
| `header.html` | Custom Code element in a **Universal** section at the top of every page | `OC_CONFIG.business`, `nav`, `headerCta`, `promo` |
| `footer.html` | Custom Code element in a **Universal** section at the bottom of every page | `OC_CONFIG.business`, `branches` (first 3), `nav`, `social`, `links` |

The paste-ready versions also carry the site-wide code:
- `ghl-ready/site/B-header-section.html` = the global CSS + `header.html`;
- `ghl-ready/site/C-footer-section.html` = `footer.html` + `oc-config.js` + `oc-site.js`.

## Section settings in GHL

- **Section:** full width, top/bottom padding 0, no background, no border.
- **Row/column:** full width, padding 0.
- **Save as:** **Universal**. It syncs everywhere, including store pages. **Global** syncs within this website only.

## Behaviour

**Header**
- The current page is highlighted (`aria-current`); product pages count as Eyewear.
- **Mobile menu below 900px:**
  - a 44px button with `aria-expanded`;
  - Escape closes it and returns focus to the button;
  - choosing a link closes it.
- A "Skip to content" link targets `#oc-main`, which each page's first block carries.
- **Promo banner:** hidden unless `promo.enabled` is true and has text.
- **Logo:** `business.logo` shows the logo image; otherwise the round initial mark.

**Footer**
- Branch addresses and grouped opening hours (e.g. "Mon – Sat 10am – 7pm").
- Social links open in a new tab, with screen-reader text saying so.
- The "Staff sign in" link appears only when `links.staffLogin` is set.

**Without JavaScript** (e.g. in the GHL editor, which doesn't run custom code), the static fallback text inside the markup shows: the sample business name and the default menu.
