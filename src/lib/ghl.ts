/*
 * The business's own GoHighLevel embeds: the contact form, the booking calendar and the Conversation AI
 * chat. These IDs are public (they appear in the page HTML), so they live here rather than in env.
 * The account serves its widgets from a white-label domain (EMBED_ORIGIN). Used by next.config.ts for
 * the Content-Security-Policy as well, so keep this file free of React and Node imports.
 */

/** White-label GoHighLevel domain that serves this account's forms, calendars and embed script. */
export const EMBED_ORIGIN = "https://api.multiplytalents.io";

/** GHL's helper that sizes embedded forms and calendars to their content. */
export const EMBED_SCRIPT = `${EMBED_ORIGIN}/js/form_embed.js`;

/** Sites → Forms → "General Inquiry" (used on the contact page). */
export const INQUIRY_FORM = { id: "2f3PtQjuRm0033NMwe58", name: "General Inquiry", height: 921 };

/** Calendars → the booking calendar shown on the eye-exam page when the dashboard maps none. */
export const BOOKING_CALENDAR_ID = "dOUtJja6Y2Le44UeYpuE";

/** Conversation AI chat widget (loaded on every page except checkout). */
export const CHAT_WIDGET = {
  id: "6ad705dce19e4c46e8007fb6",
  loader: "https://widgets.leadconnectorhq.com/loader.js",
  resources: "https://widgets.leadconnectorhq.com/chat-widget/loader.js",
};

export const formUrl = (id: string) => `${EMBED_ORIGIN}/widget/form/${encodeURIComponent(id)}`;
export const bookingUrl = (calendarId: string) => `${EMBED_ORIGIN}/widget/booking/${encodeURIComponent(calendarId)}`;

/**
 * Origins the CSP must allow for these embeds. The chat widget runs in the page itself and pulls its
 * phone-number input and session scripts from *.leadconnectorhq.com and its font from fonts.bunny.net
 * (found by loading the pages and reading the CSP reports).
 */
export const CSP_SCRIPT_ORIGINS = [EMBED_ORIGIN, "https://*.leadconnectorhq.com"];
export const CSP_STYLE_ORIGINS = ["https://*.leadconnectorhq.com", "https://fonts.bunny.net"];
export const CSP_FONT_ORIGINS = ["https://*.leadconnectorhq.com", "https://fonts.bunny.net"];
export const CSP_FRAME_ORIGINS = [EMBED_ORIGIN];
