import "server-only";
import { z } from "zod";
import { INQUIRY_KINDS, INTERESTS, type InquiryPayload } from "./api-types";

/*
 * Server-side validation for POST /api/inquiry — the same rules as the dashboard's
 * POST /api/public/v1/inquiries (docs/PUBLIC_API.md). Empty strings become null.
 */

const optionalText = (max: number, message: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null))
    .pipe(z.string().max(max, message).nullable());

export const inquirySchema = z
  .object({
    fullName: z.string({ error: "Please enter your name." }).trim().min(1, "Please enter your name.").max(120, "Please keep your name under 120 characters."),
    email: optionalText(254, "Please enter a valid email address.").pipe(z.email("Please enter a valid email address.").nullable()),
    phone: optionalText(40, "Please enter a valid mobile number.").refine((v) => v === null || v.replace(/\D/g, "").length >= 7, "Please enter a mobile number with at least 7 digits."),
    interest: z.enum(INTERESTS, { error: "Please choose what you're interested in." }),
    preferredBranchId: optionalText(64, "Please choose a branch from the list.").pipe(z.guid("Please choose a branch from the list.").nullable()),
    message: optionalText(2000, "Please keep your message under 2,000 characters."),
    smsConsent: z.boolean().default(false),
    marketingConsent: z.boolean().default(false),
    kind: z.enum(INQUIRY_KINDS),
    productName: optionalText(200, "Product name is too long."),
    sourcePage: optionalText(300, "Invalid page.").refine((v) => v === null || v.startsWith("/"), "Invalid page."),
    website: z.string().max(200).default(""),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Please give us an email address or a mobile number." });
    }
  });

export type InquiryField = keyof InquiryPayload;
export const INQUIRY_FIELDS: InquiryField[] = [
  "fullName",
  "email",
  "phone",
  "interest",
  "preferredBranchId",
  "message",
  "smsConsent",
  "marketingConsent",
  "kind",
  "productName",
  "sourcePage",
  "website",
];

export function parseInquiry(input: unknown): { ok: true; data: InquiryPayload } | { ok: false; fieldErrors: Partial<Record<InquiryField, string>> } {
  const result = inquirySchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Partial<Record<InquiryField, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (INQUIRY_FIELDS as string[]).includes(key) && !fieldErrors[key as InquiryField]) {
      fieldErrors[key as InquiryField] = issue.message;
    }
  }
  return { ok: false, fieldErrors };
}
