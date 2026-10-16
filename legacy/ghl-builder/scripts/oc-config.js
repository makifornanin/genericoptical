/*
 * Optical customer website — business configuration (white-label)
 * ===================================================================
 * ONE place for everything that changes from business to business. Edit the values, then paste
 * the whole file wrapped in a script tag in GHL → Sites → Websites → (site) → Settings →
 * Tracking Code → **Header** (it must load before oc-site.js, which goes in the Footer box).
 *
 * The sample values describe "Lensmere Optical", a FICTIONAL business used for the preview.
 * Replace all of them before publishing (see ghl-setup-guide.md → "Configure the business").
 *
 * GHL custom values: any text value may instead be a GHL merge tag such as
 *   name: "{{custom_values.business_name}}"
 * so non-technical staff can edit it under Settings → Custom Values. If GHL does not replace the
 * tag on a page, oc-site.js treats the raw "{{…}}" text as missing and keeps the fallback, and
 * logs a console warning (it never shows curly braces to visitors).
 *
 * Paths: use the GHL page paths you create (e.g. "/eyewear"). Nothing here is secret: this file
 * is public browser code. Never put API keys, tokens or dashboard URLs with credentials in it.
 */
window.OC_CONFIG = {
  business: {
    name: "Lensmere Optical",
    legalName: "Lensmere Optical Co. (demo)",
    tagline: "Eye care & eyewear",
    logo: "", // URL of a logo image (GHL media library). Empty = round initial mark.
    phone: "+63 2 8000 0100",
    email: "hello@lensmere.example",
    address: "2F Linden Arcade, 118 Lumen Street, Makati City",
    timezone: "Asia/Manila", // IANA zone used for the live "Open now" badges
    currency: "PHP",
    locale: "en-PH",
    priceNote: "Prices include VAT where applicable. Prescription lenses are priced separately based on your prescription and lens options; availability varies by branch.",
    replyTime: "usually within one business day",
  },

  // Colours. Text colours on brand/accent are picked automatically for contrast.
  theme: {
    brand: "#1f2b22",
    accent: "#b5e14a",
    canvas: "#f6f6f3",
  },

  // GHL page paths. Change only if you name pages differently in GHL.
  links: {
    home: "/",
    eyewear: "/eyewear",
    product: "/eyewear-item", // product detail page (?p=<product-id>). Not "/product": GHL reserves /product/ for store pages.
    services: "/services",
    booking: "/book",
    contact: "/contact",
    about: "/about",
    faq: "/faq",
    privacy: "/privacy",
    terms: "/terms",
    bookingConfirmed: "/booking-confirmed",
    thankYou: "/thank-you",
    store: "", // optional: GHL online store page (Sites → Store). Empty = no "Shop online" links.
    staffLogin: "", // optional: dashboard sign-in URL for staff. Empty = hidden.
  },

  nav: [
    { label: "Eyewear", href: "/eyewear" },
    { label: "Services", href: "/services" },
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ],
  headerCta: { label: "Book an exam", href: "/book" },

  // Thin banner above the header. Set enabled: false to hide it.
  promo: {
    enabled: true,
    strong: "Sample website.",
    text: "Lensmere Optical is a fictional business — names, prices and branches are sample data.",
    linkLabel: "",
    href: "",
  },

  social: [
    // { label: "Facebook", href: "https://facebook.com/yourpage" },
    // { label: "Instagram", href: "https://instagram.com/yourpage" },
  ],

  // Branches. hours: 24h "HH:MM" open/close per day; null = closed that day.
  // calendar: the GHL calendar to book this branch (see booking below).
  branches: [
    {
      id: "makati",
      name: "Makati",
      address: ["2F Linden Arcade, 118 Lumen Street", "Makati City"],
      phone: "+63 2 8000 0101",
      mapUrl: "",
      hours: { mon: ["10:00", "19:00"], tue: ["10:00", "19:00"], wed: ["10:00", "19:00"], thu: ["10:00", "19:00"], fri: ["10:00", "19:00"], sat: ["10:00", "19:00"], sun: ["11:00", "17:00"] },
      calendar: "",
    },
    {
      id: "quezon-city",
      name: "Quezon City",
      address: ["Unit 4, 52 Verde Avenue", "Quezon City"],
      phone: "+63 2 8000 0102",
      mapUrl: "",
      hours: { mon: ["10:00", "19:00"], tue: ["10:00", "19:00"], wed: ["10:00", "19:00"], thu: ["10:00", "19:00"], fri: ["10:00", "19:00"], sat: ["10:00", "19:00"], sun: ["11:00", "17:00"] },
      calendar: "",
    },
    {
      id: "pasig",
      name: "Pasig",
      address: ["G/F Alder Place, 9 Alder Road", "Pasig City"],
      phone: "+63 2 8000 0103",
      mapUrl: "",
      hours: { mon: ["10:00", "19:00"], tue: ["10:00", "19:00"], wed: ["10:00", "19:00"], thu: ["10:00", "19:00"], fri: ["10:00", "19:00"], sat: ["10:00", "19:00"], sun: ["11:00", "17:00"] },
      calendar: "",
    },
  ],

  // Services. enabled:false hides a service everywhere. bookable:true = has a GHL calendar and
  // shows "Book" buttons; bookable:false = walk-in / ask in branch. price: number in currency
  // units, or null (then priceLabel is shown). calendars: optional per-branch GHL calendar for
  // this service, e.g. { makati: "https://…/widget/booking/abc123" } (overrides branch.calendar).
  services: [
    {
      id: "eye-exam",
      name: "Comprehensive eye exam",
      description: "Refraction, eye-health screening and a clear explanation of your prescription.",
      duration: 45,
      price: 500,
      bookable: true,
      enabled: true,
      featured: true,
      calendars: {},
    },
    {
      id: "contact-lens",
      name: "Contact lens consultation",
      description: "Measurements, trial lenses and a handling lesson — for first-time and experienced wearers.",
      duration: 30,
      price: 800,
      bookable: true,
      enabled: true,
      featured: true,
      calendars: {},
    },
    {
      id: "optical-consult",
      name: "Frame & lens consultation",
      description: "Help choosing frames and lens options for how you work, drive and read.",
      duration: 30,
      price: null,
      priceLabel: "Free",
      bookable: true,
      enabled: true,
      featured: true,
      calendars: {},
    },
    {
      id: "prescription-eyewear",
      name: "Prescription eyewear",
      description: "Single vision, progressive and specialty lenses made to your prescription by our partner laboratory. Ready in 3–7 days.",
      duration: null,
      price: null,
      priceLabel: "Lenses from ₱1,500",
      bookable: false,
      enabled: true,
      featured: false,
    },
    {
      id: "lens-replacement",
      name: "Lens replacement",
      description: "New lenses in the frame you already love. Bring your frame and prescription; we check the frame's condition first.",
      duration: null,
      price: null,
      priceLabel: "From ₱1,200",
      bookable: false,
      enabled: true,
      featured: false,
    },
    {
      id: "adjustments-repairs",
      name: "Frame adjustment & repairs",
      description: "Free adjustments and fit checks for any frame bought from us; screws, nose pads and hinge repairs while you wait where possible.",
      duration: null,
      price: null,
      priceLabel: "Adjustments free · repairs quoted",
      bookable: false,
      enabled: true,
      featured: false,
    },
  ],

  // Native GHL calendars. A value can be a calendar ID or the full booking-widget URL from
  // GHL → Calendars → (calendar) → Share → Embed code / link. Resolution order on the booking page:
  // service.calendars[branch] → branch.calendar → booking.defaultCalendar.
  booking: {
    defaultCalendar: "",
    widgetBase: "https://api.leadconnectorhq.com/widget/booking/", // white-label: your agency's domain
    embedScript: "https://link.msgsndr.com/js/form_embed.js",
    height: 820,
  },

  // Native GHL forms. A value can be a form ID or the full form-widget URL from
  // GHL → Sites → Forms → (form) → Integrate → Embed. Hidden-field query keys must match the
  // "Query key" you set on the form's hidden fields (see ghl-setup-guide.md → Forms).
  forms: {
    contact: "",
    product: "", // empty = the contact form is reused for product inquiries
    widgetBase: "https://api.leadconnectorhq.com/widget/form/",
    embedScript: "https://link.msgsndr.com/js/form_embed.js",
    productQueryKey: "product_name",
    kindQueryKey: "inquiry_kind",
    pageQueryKey: "source_page",
    height: 760,
  },

  hero: {
    // Optional: override the home-page headline and intro without editing the HTML block.
    title: "",
    body: "",
    // Product ids from the catalogue (scripts/oc-catalogue.js) shown beside the hero text.
    products: ["arden-101", "arden-round-33", "brio-kids-sun"],
    stats: true, // Branches · Frames & eyewear · Eye exam duration (computed from this file)
  },

  faqs: [
    { q: "Do I need an appointment for an eye exam?", a: "Walk-ins are welcome when an optometrist is free, but booking guarantees your slot. Comprehensive exams take about 45 minutes." },
    { q: "How long do prescription glasses take?", a: "Most single-vision orders are ready in 3–5 days. Progressive and specialty lenses take 5–7 days because they're made to measure at our partner laboratory." },
    { q: "Can I bring a prescription from another clinic?", a: "Yes. Bring your written prescription (ideally less than a year old) and we'll fit lenses to it. We may recommend a quick check if it's older." },
    { q: "Which payment methods do you accept?", a: "Cash, credit and debit cards, bank transfer, GCash and Maya. Orders can be reserved with a deposit and settled at pickup." },
    { q: "Do you fit contact lenses for first-time wearers?", a: "Yes. A contact lens consultation includes measurements, trial lenses and a lesson on safe handling and care." },
    { q: "Is there a warranty on frames?", a: "Frames carry a 6-month warranty against manufacturing defects, and adjustments are always free." },
  ],

  // sample:true shows a visible "Sample reviews" label. Replace with real, attributable reviews
  // (with the customer's permission) and set sample:false — or set enabled:false to hide the section.
  testimonials: {
    enabled: true,
    sample: true,
    items: [
      { quote: "They explained every number on my prescription and never once pushed the most expensive lenses.", name: "Sample customer", context: "Eye exam, Makati" },
      { quote: "My first contact lens fitting — patient, unhurried and I left knowing exactly how to care for them.", name: "Sample customer", context: "Contact lenses, Quezon City" },
      { quote: "Dropped off a frame with a loose hinge and it was fixed while I had a coffee.", name: "Sample customer", context: "Repairs, Pasig" },
    ],
  },

  legal: {
    draft: true, // shows a "Draft — needs legal review" notice on Privacy and Terms
    privacyEmail: "privacy@lensmere.example",
    lastUpdated: "2026-10-16",
    jurisdiction: "the Philippines (Data Privacy Act of 2012)",
  },

  catalogue: {
    // bookService: the service a product page's booking button selects (by service id); empty = no button.
    categories: [
      { id: "frames", label: "Frames", bookService: "optical-consult", bookLabel: "Book a fitting" },
      { id: "sunglasses", label: "Sunglasses", bookService: "optical-consult", bookLabel: "Book a fitting" },
      { id: "contact-lenses", label: "Contact lenses", bookService: "contact-lens", bookLabel: "Book a lens consultation" },
      { id: "accessories", label: "Accessories", bookService: "", bookLabel: "" },
    ],
    showPrices: true,
    // What the product page says about stock. The showcase catalogue is NOT live inventory —
    // live stock is only shown by the GHL store (synced from the dashboard).
    availabilityNote: "Stock differs by branch. Send us a note and we'll confirm availability, or reserve it for a try-on.",
  },

  // Where images live. In GHL either set base to a folder URL that keeps file names, or map each
  // file to its GHL media-library URL: { "products/arden.svg": "https://…" }.
  assets: {
    base: "",
    map: {},
  },
};
