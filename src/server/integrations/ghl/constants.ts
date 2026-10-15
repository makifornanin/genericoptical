/**
 * Facts about the HighLevel API this integration relies on. Every value here comes from the official
 * docs (marketplace.gohighlevel.com/docs and github.com/GoHighLevel/highlevel-api-docs, checked
 * 2026-10-15) — see docs/GHL_API_CAPABILITY_MATRIX.md for sources and confidence.
 */

/** Install (consent) URL. White-label agencies use marketplace.leadconnectorhq.com (set GHL_MARKETPLACE_URL). */
export const GHL_MARKETPLACE_URL = "https://marketplace.gohighlevel.com";
export const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

/**
 * API versions pinned per endpoint group. The date-versioned endpoints are documented and supported;
 * v3 (released 2026-06-11) renames some OAuth/search parameters — migrate deliberately, not implicitly.
 */
export const VERSION = {
  default: "2021-07-28",
  calendars: "2021-04-15",
} as const;

/** Scopes the marketplace app must request (and that the connection test verifies). */
export const GHL_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "opportunities.readonly",
  "opportunities.write",
  "calendars.readonly",
  "calendars/events.readonly",
  "calendars/events.write",
  "users.readonly",
  "locations.readonly",
  "locations/customFields.readonly",
  "products.readonly",
  "products.write",
  "products/prices.readonly",
  "products/prices.write",
  "payments/orders.readonly",
  "payments/transactions.readonly",
] as const;

/**
 * Official webhook verification keys, published at
 * https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide. HighLevel announces
 * rotations by email/Slack; override with GHL_WEBHOOK_ED25519_PUBLIC_KEY / GHL_WEBHOOK_RSA_PUBLIC_KEY
 * without a code change.
 */
export const GHL_WEBHOOK_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

/** Legacy RSA-SHA256 key for the X-WH-Signature header (announced deprecated 2026-09-01). */
export const GHL_WEBHOOK_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

/** GHL appointment status → dashboard status. */
export const APPOINTMENT_STATUS_FROM_GHL: Record<string, "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"> = {
  new: "scheduled",
  booked: "scheduled",
  confirmed: "confirmed",
  active: "confirmed",
  showed: "completed",
  completed: "completed",
  noshow: "no_show",
  cancelled: "cancelled",
  invalid: "cancelled",
};

/** Dashboard status → GHL appointmentStatus (request enum: new, confirmed, cancelled, showed, noshow, invalid). */
export const APPOINTMENT_STATUS_TO_GHL: Record<string, string> = {
  scheduled: "new",
  confirmed: "confirmed",
  completed: "showed",
  cancelled: "cancelled",
  no_show: "noshow",
};
