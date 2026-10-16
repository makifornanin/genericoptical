export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Opening hours per weekday in the business time zone ("HH:mm", 24h). `null` = closed. */
export type DayHours = { open: string; close: string } | null;
export type WeekHours = Record<Weekday, DayHours>;

export type WebsiteFaq = { question: string; answer: string };
export type WebsiteValue = { title: string; body: string };

export type WebsiteContent = {
  heroEyebrow?: string;
  heroTitle?: string;
  heroBody?: string;
  aboutTitle?: string;
  aboutBody?: string;
  values?: WebsiteValue[];
  faqs?: WebsiteFaq[];
  privacyContactEmail?: string;
};

export type BusinessSettings = {
  /** Largest discount (basis points) staff without `sales.discount.unlimited` may apply. */
  maxStaffDiscountBps?: number;
  /** Who owns appointment records when GoHighLevel calendars are connected. */
  appointmentsAuthority?: "platform" | "ghl";
  enabledPaymentMethods?: string[];
  defaultAppointmentBufferMinutes?: number;
  /**
   * Public catalogue feed for a website hosted elsewhere (e.g. GoHighLevel custom code): published
   * products, branches and services only, readable from browsers on the listed origins.
   */
  catalogueFeed?: { enabled: boolean; origins: string[] };
};

export type PermissionOverrides = { grant?: string[]; revoke?: string[] };

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
