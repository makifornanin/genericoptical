# Home — visible copy (demo business: Lensmere Optical, fictional)

Captured from http://localhost:3000/ on 2026-10-15. Items marked _(dynamic)_ come from the database / Settings and will differ for a real business.

## Site chrome (shown on every page)

**Demo banner** _(only for demo businesses)_
> **Demo website.** Lensmere Optical is a fictional business — names, prices and branches are sample data. [Open the staff demo]

**Header**
- Logo mark: round "L" initial _(dynamic: first letter of business name; replaced by the logo image when one is uploaded)_
- Name: Lensmere Optical · Tagline: Eye care & eyewear _(dynamic)_
- Nav: Eyewear · Services · About · FAQ · Contact
- Button: **Book an exam**
- Mobile: menu button (aria-label "Open menu" / "Close menu"); the menu lists the same 5 links and a full-width **Book an exam** button.

**Footer**
- Lensmere Optical — Eye care & eyewear
- +63 2 8000 0100 · hello@lensmere.example · 2F Linden Arcade, 118 Lumen Street, Makati City _(dynamic)_
- Button: **Book an eye exam ↗**
- Branch columns _(dynamic)_:
  - **MAKATI** — 2F Linden Arcade, 118 Lumen Street / Makati City — Mon – Sat 10am – 7pm · Sun 11am – 5pm
  - **QUEZON CITY** — Unit 4, 52 Verde Avenue / Quezon City — Mon – Sat 10am – 7pm · Sun 11am – 5pm
  - **PASIG** — G/F Alder Place, 9 Alder Road / Pasig City — Mon – Sat 10am – 7pm · Sun 11am – 5pm
- Footer nav: Eyewear · Services · About · FAQ · Contact · Privacy · Terms
- © 2026 Lensmere Optical Co. (demo). Staff sign in

## Hero
- Eyebrow: EYE CARE & EYEWEAR _(dynamic: heroEyebrow)_
- H1: **Clear vision, unhurried care, and frames that feel like you.** _(dynamic: heroTitle)_
- Body: Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches — with optometrists who take the time to explain your options. _(dynamic: heroBody)_
- Buttons: **Book an eye exam →** · **Browse eyewear**
- Stats _(dynamic)_: Branches **3** · Frames & eyewear **27** · Eye exam **45 min**
- Images _(dynamic)_: Arden 101 (large) · Arden Round 33 — from ₱3,250.00 · Brio Kids Sun — from ₱1,450.00

## 01 Services
- Eyebrow: 01 SERVICES
- H2: **Care that starts with a proper examination.**
- Body: Every service below can be booked online. Durations are what we actually schedule, so you'll never be rushed.
- Link: All services →
- Rows _(dynamic)_:

| # | Service | Description | Duration | Price | Link |
|---|---|---|---|---|---|
| 01 | Comprehensive eye exam | Refraction, eye-health screening and prescription. | 45 minutes | ₱500.00 | Book ↗ |
| 02 | Contact lens fitting | Measurements, trial lenses and handling lesson. | 30 minutes | ₱800.00 | Book ↗ |
| 03 | Frame & lens consultation | Help choosing frames and lens options. | 30 minutes | Price on request | Book ↗ |

## 02 Eyewear
- Eyebrow: 02 EYEWEAR
- H2: **Frames chosen for fit, not just fashion.**
- Body: A considered selection across shapes and materials. Try anything on in branch — our opticians will check the fit to your face and prescription.
- Link: See all eyewear →
- Cards _(dynamic)_: Arden 101 — Arden · Frames — ₱2,950.00 · Arden 204 — Arden · Frames — ₱3,450.00 · Arden Round 33 — Arden · Frames — ₱3,250.00 · Brio Kids Sun — Brio · Sunglasses — ₱1,450.00 · Halden Aviator RX — Halden · Frames — ₱4,250.00 · Halden Oval — Halden · Frames — ₱3,650.00 · Kiyo Hex — Kiyo · Frames — ₱3,150.00 · Halden Pilot — Halden · Sunglasses — ₱4,450.00

## 03 Our approach
- Eyebrow: 03 OUR APPROACH
- H2: **It starts with listening.** _(dynamic: aboutTitle)_
- Body _(dynamic: aboutBody)_: Choosing eyewear is about more than picking a frame. We begin with a thorough examination, explain what we find in plain language, and help you weigh lens and frame options against how you actually live — screens, sport, driving, reading. From the first check to the final fitting, every visit is meant to feel considered and never rushed.
- Values _(dynamic: values[])_:
  1. **Thorough eye exams** — Refraction, eye-health screening and a clear explanation of your prescription.
  2. **Honest guidance** — Lens and frame recommendations that fit your needs and budget.
  3. **Made-to-measure lenses** — Single vision, progressives and specialty lenses from our partner laboratory.
  4. **Aftercare included** — Free adjustments and fit checks for the life of your frames.

## 04 Visit us
- Eyebrow: 04 VISIT US
- H2: **3 branches, one standard of care.** _(dynamic: count)_
- Cards _(dynamic)_ — each: name, status pill (**Open**/**Closed**), status line (e.g. "Open now · until 7pm" or "Closed · opens tomorrow 10am"), address, phone, hours, button **Book here**:
  - **Makati** — 2F Linden Arcade, 118 Lumen Street, Makati City — +63 2 8000 0101
  - **Quezon City** — Unit 4, 52 Verde Avenue, Quezon City — +63 2 8000 0102
  - **Pasig** — G/F Alder Place, 9 Alder Road, Pasig City — +63 2 8000 0103
  - Hours (all): Mon – Sat 10am – 7pm · Sun 11am – 5pm

## CTA + FAQ teaser
- Eyebrow: READY WHEN YOU ARE
- H2: **Book your next eye exam online.**
- Body: Pick a branch, a service and a time that suits you. We'll confirm by phone or email.
- Buttons: **Book an appointment →** · **Ask a question**
- Eyebrow: COMMON QUESTIONS _(dynamic: first 4 FAQs — full text in `../faq/content.md`)_
  - Do I need an appointment for an eye exam?
  - How long do prescription glasses take?
  - Can I bring a prescription from another clinic?
  - Which payment methods do you accept?
- Link: All questions →
