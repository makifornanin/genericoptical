/**
 * Philippine phone numbers in one consistent format, so the same person is recognised however the
 * number was typed ("0917 123 4567", "+63-917-123-4567", "639171234567", "9171234567").
 *
 * - Mobile (9XX…, 10 national digits) → "+63 917 123 4567"
 * - Metro Manila landline (2 + 8 digits) → "+63 2 8123 4567"
 * - Other PH landlines (area code + 7 digits) → "+63 32 123 4567"
 * - Anything else (foreign numbers, extensions, odd lengths) is kept as typed: we never guess.
 */
export function normalizePhPhone(input: string): string {
  const raw = input.trim();
  if (!raw) return raw;
  if (/[a-z]/i.test(raw)) return raw; // e.g. "ext 12": keep as typed
  const digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+");
  let national: string | null = null;
  if (international) national = digits.startsWith("63") ? digits.slice(2) : null;
  else if (digits.startsWith("63") && digits.length >= 11) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 10 && digits.startsWith("9")) national = digits;
  if (!national) return raw;
  if (national.length === 10 && national.startsWith("9")) return `+63 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  if (national.length === 9 && national.startsWith("2")) return `+63 2 ${national.slice(1, 5)} ${national.slice(5)}`;
  if (national.length === 9) return `+63 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
  return raw;
}

/** E.164 form (no spaces) for external systems such as GoHighLevel, or null if not a PH number. */
export function phE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const n = normalizePhPhone(input);
  return n.startsWith("+63") ? n.replace(/\s/g, "") : null;
}
