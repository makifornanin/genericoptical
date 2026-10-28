/*
 * Demo store card step. No payment provider is connected and no card data leaves the browser:
 * the number is checked here against published test cards, and only the brand and last four digits
 * are sent with the order, which the dashboard records as "Online card (demo — not charged)".
 */

export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", brand: "Visa", outcome: "approved" as const },
  { number: "5555 5555 5555 4444", brand: "Mastercard", outcome: "approved" as const },
  { number: "4000 0000 0000 0002", brand: "Visa", outcome: "declined" as const },
];

/** Last four digits the server accepts as an approved demo payment. */
export const APPROVED_LAST4 = ["4242", "4444"];

const digits = (s: string) => s.replace(/\D/g, "");

function luhn(num: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return num.length >= 12 && sum % 10 === 0;
}

export type CardCheck = { ok: true; brand: string; last4: string } | { ok: false; field: "number" | "expiry" | "cvc"; message: string };

export function checkDemoCard(input: { number: string; expiry: string; cvc: string }, now = new Date()): CardCheck {
  const num = digits(input.number);
  if (!luhn(num)) return { ok: false, field: "number", message: "Enter a valid card number." };
  const card = TEST_CARDS.find((c) => digits(c.number) === num);
  if (!card) return { ok: false, field: "number", message: "This is a demo store and doesn't take real cards. Use the test card 4242 4242 4242 4242." };
  const m = /^(\d{1,2})\s*\/\s*(\d{2})$/.exec(input.expiry.trim());
  if (!m) return { ok: false, field: "expiry", message: "Use MM / YY." };
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return { ok: false, field: "expiry", message: "Use MM / YY." };
  if (new Date(year, month, 1) <= new Date(now.getFullYear(), now.getMonth(), 1)) return { ok: false, field: "expiry", message: "Use an expiry date in the future." };
  if (!/^\d{3,4}$/.test(input.cvc.trim())) return { ok: false, field: "cvc", message: "Enter the 3-digit security code." };
  if (card.outcome === "declined") return { ok: false, field: "number", message: "Card declined. (This test card always declines; try 4242 4242 4242 4242.)" };
  return { ok: true, brand: card.brand, last4: num.slice(-4) };
}

/** "4242424242424242" → "4242 4242 4242 4242" while typing. */
export const formatCardNumber = (v: string) =>
  digits(v)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

export function formatExpiry(v: string): string {
  const d = digits(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
}
