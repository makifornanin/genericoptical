# Book — `/book`

- **SEO title:** Book an appointment · {Business}
- **SEO description:** Book an eye examination, contact lens consultation or eyewear consultation online.
- **Reference:** `screenshots/desktop/booking.png`, `screenshots/states/booking-deep-link-mobile.png`

## Sections

| # | Paste | What it is |
|---|---|---|
| — | OC Header | |
| 1 | `blocks/01-intro.html` | Page intro |
| 2 | `blocks/02-booking.html` | Step card (branch → service → native GHL calendar) + aside (how it works, opening hours, phone) |
| — | `99-page-script.html` | `booking.js` |
| — | OC Footer | |

Page CSS: `00-page-custom-css.css` → page Settings → Custom CSS.

## How booking works

**GHL is the source of truth.** Availability, the booking form, confirmations, reminders and rescheduling all happen in the **native GHL calendar widget**. This page only helps the visitor pick the right calendar.

1. **Branch.** The step is hidden when there is only one branch.
2. **Service.** Bookable services only; the step is hidden when there is only one.
3. **The calendar** for that choice, loaded with GHL's official booking embed. It is resolved as:
   `services[i].calendars[branchId]` → `branches[j].calendar` → `booking.defaultCalendar`.

**Other behaviour:**
- **Deep links:** `/book?branch=pasig&service=contact-lens`. The choice is kept in the URL as the visitor changes it.
- **Aside:** shows the chosen branch's hours and phone.
- **Placeholder:** without a configured calendar, a dashed **"GHL calendar"** box explains what's missing. No booking can be made.

## GHL settings that matter here

- **Calendar confirmation → redirect to `/booking-confirmed`.**
- **Durations:** calendar durations should match `services[].duration`.
- **Dashboard sync:** map each calendar to a branch and appointment type in the dashboard (Settings → Integrations → GoHighLevel → Mapping). Otherwise bookings wait in *Needs attention* there.

Full steps: ghl-setup-guide.md §10.
