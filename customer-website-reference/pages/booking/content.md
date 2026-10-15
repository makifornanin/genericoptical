# Booking — visible copy (demo business: Lensmere Optical, fictional)

Captured from http://localhost:3000/book on 2026-10-15 (initial state and with a branch, service, date and time selected). Header/footer copy: see `../home/content.md`.

## Intro
- Eyebrow: ONLINE BOOKING
- H1: **Book an appointment.**
- Body: Choose a branch, a service and a time. It takes about a minute.

## Booking card
**1 Choose a branch** _(dynamic)_
- Makati — 2F Linden Arcade, 118 Lumen Street, Makati City
- Quezon City — Unit 4, 52 Verde Avenue, Quezon City
- Pasig — G/F Alder Place, 9 Alder Road, Pasig City

**2 Choose a service** _(dynamic)_
- Comprehensive eye exam — ₱500.00 — 45 min
- Contact lens fitting — ₱800.00 — 30 min
- Frame & lens consultation — 30 min

**3 Pick a date and time**
- Before choosing: "Choose a branch and a service first." (variants: "Choose a branch first." / "Choose a service first.")
- Date strip _(dynamic: 21 days from today)_: THU 15 Oct … WED 4 Nov
- Status texts: "Select a day to see open times." · "Checking availability…" · "No open times that day — try another date or call the branch."
- Example slots for Makati / Comprehensive eye exam / Friday, October 16 _(dynamic, live)_: 12:30 pm · 1:00 pm · 1:30 pm · 2:00 pm · 2:30 pm · 4:30 pm · 5:00 pm · 5:30 pm · 6:00 pm

**4 Your details**
- Full name * · Mobile number * · Email
- Anything we should know? — placeholder: e.g. current glasses, symptoms, contact lens history
- Checkbox: Text me appointment reminders
- Checkbox: Send me occasional offers and eye-care reminders

**Footer**
- Summary (nothing chosen): Choose a service, date and time to continue.
- Summary (example): **Comprehensive eye exam** · Makati · Friday, October 16, 1:00 pm
- Button: **Request appointment** (pending: "Booking…")

**Success state** (not captured)
- H2: **You're booked in.**
- Body: Comprehensive eye exam at our Makati branch on **Friday, October 16** at **1:00 pm**. We'll contact you to confirm. If you need to change it, just call the branch.
- Button: Back to home

**Errors** (server): "That time was just taken or is outside opening hours. Please pick another slot." · "Add a phone number so we can confirm." · "Your name is required." · "Too many submissions from this connection. Please try again in a few minutes or call us."

**Unavailable state**: Online booking isn't available right now. Please call us to book.

## Aside
- Eyebrow: HOW IT WORKS
  1. Request a time that suits you — slots reflect real availability.
  2. We hold it straight away and confirm by phone or email.
  3. Bring your current glasses or contact lenses, and any old prescriptions.
- Eyebrow: OPENING HOURS _(dynamic)_ — Mon – Sat 10am – 7pm · Sun 11am – 5pm
  - Note: Times shown in Asia/Manila time. Some branches keep different hours.
- Eyebrow: PREFER TO CALL? — **+63 2 8000 0100** _(dynamic)_
