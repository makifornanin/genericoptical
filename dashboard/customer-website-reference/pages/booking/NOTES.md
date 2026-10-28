# Booking — `/book`

| | |
|---|---|
| Original source | `src/app/(site)/book/page.tsx` → `source/page.tsx`; `src/app/(site)/book/booking-form.tsx` → `source/booking-form.tsx` (both verbatim) |
| Page-specific components | `BookingForm` (client component) with local `Step`, `Choice`, date helpers (`addDays`, `weekdayOf`, `dayLabel`, `timeLabel`) — all in `booking-form.tsx` |
| Shared components used | `Container`, `Eyebrow`, `groupedHours`, `siteButton`; form primitives `TextField`, `TextareaField`, `Checkbox`, `FormError` (`components/ui/form.tsx`); `useAction` (`components/app/use-action.ts`) |
| Data | `getSite()` → active branches, public appointment types, business hours/time zone/phone; `todayIn(biz.timezone)` |
| Backend actions | `publicSlotsAction` → `availableSlots()` (read-only slot lookup); `bookAppointmentAction` → `requestPublicAppointment()` (creates appointment + lead) |
| Query string | `?branch=<branch id>` and `?type=<appointment type id>` preselect choices (used by "Book here" / "Book this" links) |
| `<title>` | `Book an appointment · Lensmere Optical` |
| Meta description | "Book an eye examination or contact lens fitting online." |
| Screenshots | `screenshots/booking-desktop.png`, `booking-mobile.png` (initial state); `booking-slots-selected-desktop.png`, `booking-slots-selected-mobile.png` (Makati + Comprehensive eye exam + Fri 16 Oct, 1:00 pm selected; clipped to the viewport width); `booking-slots-selected-desktop-overflow.png`, `booking-slots-selected-mobile-overflow.png` (the full, horizontally overflowing canvas — see "Known bug") |
| Standalone | `standalone/booking.html` — static, clearly labelled mock of the selected state |

How the slot screenshots were made: Playwright clicked the first branch, the first service and the first date that returned ≥ 3 slots, then a time. That triggered the **read-only** `publicSlotsAction` (an HTTP POST with a `Next-Action` header — 4 calls in total). "Request appointment" was never clicked; every other POST was blocked.

## Sections, top to bottom

### 1. Intro (static)
Eyebrow "Online booking", H1 "Book an appointment." (40px → 52px), body "Choose a branch, a service and a time. It takes about a minute." Bottom hairline.

### 2. Booking card (`BookingForm`) — left column
White card, radius 24px, padding 24px → 32px. Four numbered steps separated by hairlines; a step's number badge turns brand-coloured when that step is complete.

1. **Choose a branch** (only when > 1 branch): one selectable card per branch (name + "address line 1, city"). Selecting resets date and time. 1 column < 640px, 3 columns ≥ 640px.
2. **Choose a service**: one card per public appointment type (name, price if any, clock + "N min"). Selecting resets the time. 1 → 2 columns.
3. **Pick a date and time**: until a branch and service are chosen it says "Choose a branch and a service first." Then a horizontally scrolling strip of the next **21 days** (from today in the business time zone) — weekday, day number, month; days the branch is closed are disabled (35% opacity). Below it, status text / slots: "Select a day to see open times." → "Checking availability…" → a grid of time buttons ("1:00 pm"; 3 columns < 640px, 6 columns ≥ 640px) or "No open times that day — try another date or call the branch." or the error text in red. Selected date/time buttons are solid ink with white text.
4. **Your details**: Full name * · Mobile number * · Email · "Anything we should know?" (textarea, placeholder "e.g. current glasses, symptoms, contact lens history") · checkboxes "Text me appointment reminders" and "Send me occasional offers and eye-care reminders" · hidden honeypot `website`.

Footer row: summary ("**Comprehensive eye exam** · Makati · Friday, October 16, 1:00 pm" or "Choose a service, date and time to continue.") and the **Request appointment** button (disabled until branch, service, date and time are chosen; shows "Booking…" while pending). Stacked < 640px, one row ≥ 640px.

**Success state** (not captured — nothing was submitted): the card is replaced by a calendar-check icon, H2 "You're booked in.", "{service} at our {branch} branch on **{long date}** at **{time}**. We'll contact you to confirm. If you need to change it, just call the branch." and an outline button "Back to home".

### 3. Aside — right column (320px ≥ 1024px; below the card on smaller screens)
- "How it works": 3 numbered sentences (static).
- "Opening hours": business-level grouped hours + "Times shown in Asia/Manila time. Some branches keep different hours." _(dynamic)_
- "Prefer to call?": business phone as a large tel: link _(dynamic)_.

Empty state: if there are no branches or no public types → "Online booking isn't available right now. Please call us to book."

## Backend rules that a GHL calendar must replicate
From `availableSlots()` / `requestPublicAppointment()` in `src/server/services/appointments.ts` (not copied — backend):
- Slots start every **30 minutes** from the branch's opening time; the appointment must **end by closing time** (so a 45-min exam's last start on a 10:00–19:00 day is 18:00).
- No slot starts **less than 30 minutes from now**.
- Types with `requiresPractitioner` (eye exam, contact lens fitting) only show times when at least one practitioner assigned to that branch (or unassigned) has no overlapping appointment; the first free practitioner is auto-assigned. Frame & lens consultation does not need a practitioner.
- The booking re-checks the slot server-side ("That time was just taken or is outside opening hours. Please pick another slot."), finds/creates a Lead by phone/email (source "website", interest eye_exam or contact_lenses), and creates an appointment with status "scheduled", source "website".
- Rate limit: 5 bookings per IP per 10 minutes. Validation: name required, phone ≥ 6 chars ("Add a phone number so we can confirm."), valid email if given.

## Known bug in the original (document, don't copy)
Once the 21-day date strip renders, the strip's intrinsic width (21 × 68px ≈ 1,420px) stretches the grid column because the grid item keeps `min-width: auto`. The whole page then overflows horizontally — 1,998px wide at a 1440px viewport and 1,490px wide on a 390px phone (see the `*-overflow.png` screenshots). The standalone reference fixes this with `min-width: 0` on the grid children (`.booking-layout > *`) so the strip scrolls inside the card, which is clearly the intended design.
