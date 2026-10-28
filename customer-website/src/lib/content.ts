/*
 * Site copy the dashboard doesn't provide: navigation, footer and how online ordering works here.
 * Business facts (hours, prices, services, FAQs, policies) come from the dashboard and are not
 * repeated here. Keep statements true for this store; anything about the demo is labelled as such.
 */

export interface NavItem {
  label: string;
  href: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Glasses", href: "/glasses" },
  { label: "Sunglasses", href: "/sunglasses" },
  { label: "Contact lenses", href: "/contact-lenses" },
  { label: "Accessories", href: "/accessories" },
  { label: "Eye care", href: "/eye-exam" },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Stores", href: "/stores" },
  { label: "Help", href: "/help" },
];

export const FOOTER_COLUMNS: { title: string; links: NavItem[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "Glasses", href: "/glasses" },
      { label: "Sunglasses", href: "/sunglasses" },
      { label: "Contact lenses", href: "/contact-lenses" },
      { label: "Accessories & care", href: "/accessories" },
    ],
  },
  {
    title: "Eye care",
    links: [
      { label: "Book an eye exam", href: "/eye-exam" },
      { label: "Prices & services", href: "/eye-exam#services" },
      { label: "Stores & hours", href: "/stores" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track an order", href: "/order" },
      { label: "Ordering & pickup", href: "/help#ordering" },
      { label: "Questions", href: "/help" },
      { label: "Contact us", href: "/contact" },
    ],
  },
];

/** How online orders work here. Shown on /help and summarised in the bag and checkout. */
export const ORDERING_HELP: { id: string; question: string; answer: string }[] = [
  {
    id: "pickup",
    question: "How does collecting in branch work?",
    answer:
      "Choose a branch at checkout. Stocked items are set aside for you as soon as you order. We contact you when your order is ready; at pickup we fit and adjust your glasses so they sit right.",
  },
  {
    id: "timing",
    question: "When will my glasses be ready?",
    answer:
      "Frames, sunglasses and accessories that are in stock at your branch are usually ready in a day or two. Prescription lenses are made at our partner laboratory, so allow about a week. Your order page shows the date we're aiming for.",
  },
  {
    id: "prescription",
    question: "How do I give you my prescription?",
    answer:
      "When you choose lenses, pick one: type it in from your written prescription, send it to us later, ask us to use the one on file from an eye exam with us, or book an eye exam first. Our optometrist checks every prescription before lenses are ordered.",
  },
  {
    id: "payment",
    question: "How do I pay?",
    answer:
      "Pay at pickup in branch, or pay online at checkout. This website is a demonstration store: the online card step is simulated, no money is taken, and real cards are refused.",
  },
  {
    id: "cancel",
    question: "Can I cancel an order?",
    answer:
      "Orders you'll pay for at pickup can be cancelled from your order page until we start working on them. For anything else, contact your pickup branch.",
  },
];

export const DEMO_NOTICE = {
  short: "Demo store: orders reach the shop's dashboard, card payments are simulated.",
  long: "This website is a working demonstration. Orders are created in the optical shop's management dashboard and stock is reserved, but the online card step is simulated: no money moves, and real cards are refused. The business, its branches and its products are fictional.",
};
