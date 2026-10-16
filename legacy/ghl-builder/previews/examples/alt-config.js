/*
 * White-label check (preview only): a second FICTIONAL business built from the same code with a
 * different config — name, colours, one branch, four services, no promo banner, no testimonials,
 * prices hidden. Build it with:  node previews/build.mjs --config=previews/examples/alt-config.js --out=previews/site-alt
 */
window.OC_CONFIG = {
  business: {
    name: "Northlight Eyecare",
    legalName: "Northlight Eyecare LLC (sample)",
    tagline: "Independent optometry",
    logo: "",
    phone: "+1 (555) 010-2200",
    email: "hello@northlight.example",
    address: "48 Harbor Street, Portland, ME",
    timezone: "America/New_York",
    currency: "USD",
    locale: "en-US",
    priceNote: "Ask in store for current pricing and insurance coverage.",
    replyTime: "within two business days",
  },
  theme: { brand: "#22324f", accent: "#f0b36a", canvas: "#f7f5f2" },
  links: {
    home: "/", eyewear: "/eyewear", product: "/eyewear-item", services: "/services", booking: "/book", contact: "/contact",
    about: "/about", faq: "/faq", privacy: "/privacy", terms: "/terms", bookingConfirmed: "/booking-confirmed", thankYou: "/thank-you", store: "", staffLogin: "",
  },
  nav: [
    { label: "Eyewear", href: "/eyewear" },
    { label: "Eye care", href: "/services" },
    { label: "Our story", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  headerCta: { label: "Book a visit", href: "/book" },
  promo: { enabled: false },
  social: [{ label: "Instagram", href: "https://instagram.com/northlight.example" }],
  branches: [
    {
      id: "harbor",
      name: "Harbor Street",
      address: ["48 Harbor Street", "Portland, ME"],
      phone: "+1 (555) 010-2200",
      mapUrl: "https://maps.example/northlight",
      hours: { mon: ["09:00", "17:30"], tue: ["09:00", "17:30"], wed: ["09:00", "19:00"], thu: ["09:00", "17:30"], fri: ["09:00", "17:30"], sat: ["10:00", "14:00"], sun: null },
      calendar: "",
    },
  ],
  services: [
    { id: "eye-exam", name: "Comprehensive eye exam", description: "Vision and eye-health check with digital retinal imaging.", duration: 60, price: null, priceLabel: "Insurance accepted", bookable: true, enabled: true, featured: true, calendars: {} },
    { id: "contact-lens", name: "Contact lens fitting", description: "Fitting, trial lenses and follow-up.", duration: 30, price: null, priceLabel: "From $95", bookable: true, enabled: true, featured: true, calendars: {} },
    { id: "prescription-eyewear", name: "Prescription glasses", description: "Lenses made to your prescription, fitted in store.", duration: null, price: null, priceLabel: "Quoted after your exam", bookable: false, enabled: true, featured: false },
    { id: "adjustments-repairs", name: "Adjustments & repairs", description: "Free adjustments; repairs while you wait.", duration: null, price: null, priceLabel: "Free adjustments", bookable: false, enabled: true, featured: false },
    { id: "lens-replacement", name: "Lens replacement", description: "Not offered at this location.", bookable: false, enabled: false },
  ],
  booking: { defaultCalendar: "", widgetBase: "https://api.leadconnectorhq.com/widget/booking/", embedScript: "https://link.msgsndr.com/js/form_embed.js", height: 820 },
  forms: { contact: "", product: "", widgetBase: "https://api.leadconnectorhq.com/widget/form/", embedScript: "https://link.msgsndr.com/js/form_embed.js", productQueryKey: "product_name", kindQueryKey: "inquiry_kind", pageQueryKey: "source_page", height: 760 },
  hero: {
    title: "Eye care that fits your life.",
    body: "Thorough exams with retinal imaging, frames from independent makers and contact lens fittings — in one friendly practice on Harbor Street.",
    products: ["vela-air", "mesa-classic", "solenne-riviera"],
    stats: true,
  },
  faqs: [
    { q: "Do you take vision insurance?", a: "Yes — bring your card and we'll check your benefits before the exam." },
    { q: "How long does an exam take?", a: "About an hour, including retinal imaging." },
  ],
  testimonials: { enabled: false, sample: false, items: [] },
  legal: { draft: true, privacyEmail: "privacy@northlight.example", lastUpdated: "2026-10-16", jurisdiction: "the United States" },
  catalogue: {
    categories: [
      { id: "frames", label: "Frames", bookService: "eye-exam", bookLabel: "Book an exam" },
      { id: "sunglasses", label: "Sunglasses", bookService: "", bookLabel: "" },
      { id: "contact-lenses", label: "Contact lenses", bookService: "contact-lens", bookLabel: "Book a fitting" },
    ],
    showPrices: false,
    availabilityNote: "Call the store to check stock before you visit.",
  },
  assets: { base: "", map: {} },
};
