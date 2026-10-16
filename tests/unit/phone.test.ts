import { describe, expect, it } from "vitest";
import { normalizePhPhone, phE164 } from "@/lib/phone";
import { customerInput } from "@/lib/schemas";

describe("Philippine phone normalisation", () => {
  it.each([
    ["0917 123 4567", "+63 917 123 4567"],
    ["09171234567", "+63 917 123 4567"],
    ["+63-917-123-4567", "+63 917 123 4567"],
    ["639171234567", "+63 917 123 4567"],
    ["9171234567", "+63 917 123 4567"],
    ["(02) 8123 4567", "+63 2 8123 4567"],
    ["+63 2 8123-4567", "+63 2 8123 4567"],
    ["032 123 4567", "+63 32 123 4567"],
  ])("%s → %s", (input, expected) => expect(normalizePhPhone(input)).toBe(expected));

  it("keeps foreign numbers and odd input as typed", () => {
    expect(normalizePhPhone("+1 415 555 0101")).toBe("+1 415 555 0101");
    expect(normalizePhPhone("8123 4567")).toBe("8123 4567");
    expect(normalizePhPhone("0917 123 4567 ext 2")).toBe("0917 123 4567 ext 2");
  });

  it("gives E.164 for PH numbers only", () => {
    expect(phE164("0917 123 4567")).toBe("+639171234567");
    expect(phE164("+1 415 555 0101")).toBeNull();
    expect(phE164(null)).toBeNull();
  });

  it("is applied by the form schemas", () => {
    expect(customerInput.parse({ firstName: "A", lastName: "B", phone: "09171234567" }).phone).toBe("+63 917 123 4567");
  });
});
