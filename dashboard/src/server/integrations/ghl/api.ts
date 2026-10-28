import { GhlClient } from "./client";
import { VERSION } from "./constants";

/**
 * Typed wrappers for the HighLevel endpoints this integration uses — and only those. Paths, fields
 * and scopes are from the official spec (see docs/GHL_API_CAPABILITY_MATRIX.md). Amounts in GHL
 * product prices, orders and opportunity values are decimal major units (e.g. 1499.5); the dashboard
 * stores integer minor units, so conversions happen here at the boundary.
 */

export const toMajor = (cents: number) => Math.round(cents) / 100;
export const toMinor = (amount: unknown) => Math.round(Number(amount ?? 0) * 100);

export type GhlContact = {
  id: string;
  locationId?: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  source?: string | null;
  dateAdded?: string | null;
  dateUpdated?: string | null;
  customFields?: { id: string; value?: unknown; fieldValue?: unknown }[] | null;
};

export type GhlOpportunity = {
  id: string;
  name: string;
  monetaryValue?: number | null;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
  assignedTo?: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  source?: string | null;
  contactId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GhlPipeline = { id: string; name: string; stages: { id: string; name: string; position?: number }[] };
export type GhlCalendar = { id: string; name: string; isActive?: boolean };
export type GhlUser = { id: string; name?: string; firstName?: string; lastName?: string; email?: string | null; deleted?: boolean };

export type GhlAppointment = {
  id: string;
  calendarId: string;
  locationId?: string;
  contactId?: string | null;
  title?: string | null;
  appointmentStatus?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
  startTime: string;
  endTime: string;
  dateAdded?: string | null;
  dateUpdated?: string | null;
};

export type GhlPrice = {
  _id: string;
  product?: string;
  name: string;
  type?: string;
  currency?: string;
  amount: number;
  sku?: string | null;
  trackInventory?: boolean;
  availableQuantity?: number | null;
  allowOutOfStockPurchases?: boolean;
};

export type GhlOrderItem = {
  name?: string;
  qty: number;
  product?: { _id?: string; name?: string } | null;
  price?: { _id?: string; name?: string; amount?: number; currency?: string } | null;
};

export type GhlOrder = {
  _id: string;
  altId?: string;
  contactId?: string | null;
  contactSnapshot?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  currency?: string;
  amount: number;
  status?: string | null;
  fulfillmentStatus?: string | null;
  liveMode?: boolean;
  items?: GhlOrderItem[];
  amountSummary?: { subtotal?: number; discount?: number; tax?: number; shipping?: number } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GhlTransaction = {
  _id: string;
  amount: number;
  amountRefunded?: number | null;
  status?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  paymentMethod?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export function ghlApi(client: GhlClient, locationId: string) {
  const r = client.request.bind(client);
  return {
    locationId,

    // ── Location & users ──
    getLocation: () => r<{ location: { id: string; name: string; timezone?: string; companyId?: string } }>(`/locations/${encodeURIComponent(locationId)}`, { what: "Sub-account" }),
    searchUsers: (companyId: string) =>
      r<{ users: GhlUser[] }>("/users/search", { query: { companyId, locationId, limit: 100 } }),

    // ── Contacts (scope contacts.*) ──
    getContact: (id: string) => r<{ contact: GhlContact }>(`/contacts/${encodeURIComponent(id)}`, { what: "Contact" }),
    findDuplicate: (q: { email?: string | null; number?: string | null }) =>
      r<{ contact?: GhlContact | null }>("/contacts/search/duplicate", { query: { locationId, email: q.email ?? undefined, number: q.number ?? undefined } }),
    createContact: (body: Record<string, unknown>) => r<{ contact: GhlContact }>("/contacts/", { method: "POST", body: { ...body, locationId } }),
    updateContact: (id: string, body: Record<string, unknown>) => r<{ contact: GhlContact }>(`/contacts/${encodeURIComponent(id)}`, { method: "PUT", body, what: "Contact" }),
    addTags: (id: string, tags: string[]) => r(`/contacts/${encodeURIComponent(id)}/tags`, { method: "POST", body: { tags }, what: "Contact" }),
    removeTags: (id: string, tags: string[]) => r(`/contacts/${encodeURIComponent(id)}/tags`, { method: "DELETE", body: { tags }, what: "Contact" }),
    addNote: (id: string, body: string) => r(`/contacts/${encodeURIComponent(id)}/notes`, { method: "POST", body: { body }, what: "Contact" }),

    // ── Opportunities (scope opportunities.*) ──
    listPipelines: () => r<{ pipelines: GhlPipeline[] }>("/opportunities/pipelines", { query: { locationId } }),
    /** POST /opportunities/pipelines (documented; names are unique per location, at least one stage). */
    createPipeline: (body: { name: string; stages: unknown[] }) => r<{ pipeline?: GhlPipeline } & Partial<GhlPipeline>>("/opportunities/pipelines", { method: "POST", body: { ...body, locationId } }),
    getOpportunity: (id: string) => r<{ opportunity: GhlOpportunity }>(`/opportunities/${encodeURIComponent(id)}`, { what: "Opportunity" }),
    createOpportunity: (body: Record<string, unknown>) => r<{ opportunity: GhlOpportunity }>("/opportunities/", { method: "POST", body: { ...body, locationId } }),
    updateOpportunity: (id: string, body: Record<string, unknown>) => r<{ opportunity: GhlOpportunity }>(`/opportunities/${encodeURIComponent(id)}`, { method: "PUT", body, what: "Opportunity" }),

    // ── Calendars & appointments (scope calendars.readonly, calendars/events.*; Version 2021-04-15) ──
    listCalendars: () => r<{ calendars: GhlCalendar[] }>("/calendars/", { query: { locationId }, version: VERSION.calendars }),
    getAppointment: (eventId: string) =>
      r<{ event?: GhlAppointment; appointment?: GhlAppointment }>(`/calendars/events/appointments/${encodeURIComponent(eventId)}`, { version: VERSION.calendars, what: "Appointment" }),
    listEvents: (q: { calendarId: string; startTime: number; endTime: number }) =>
      r<{ events: GhlAppointment[] }>("/calendars/events", { query: { locationId, ...q }, version: VERSION.calendars }),
    createAppointment: (body: Record<string, unknown>) =>
      r<GhlAppointment & { event?: GhlAppointment }>("/calendars/events/appointments", { method: "POST", body: { ...body, locationId }, version: VERSION.calendars }),
    updateAppointment: (eventId: string, body: Record<string, unknown>) =>
      r<GhlAppointment & { event?: GhlAppointment }>(`/calendars/events/appointments/${encodeURIComponent(eventId)}`, { method: "PUT", body, version: VERSION.calendars, what: "Appointment" }),

    // ── Products, prices, inventory (scope products.*, products/prices.*) ──
    createProduct: (body: Record<string, unknown>) => r<{ _id: string } & Record<string, unknown>>("/products/", { method: "POST", body: { ...body, locationId } }),
    updateProduct: (id: string, body: Record<string, unknown>) => r<{ _id: string }>(`/products/${encodeURIComponent(id)}`, { method: "PUT", body: { ...body, locationId }, what: "Product" }),
    listPrices: (productId: string) => r<{ prices: GhlPrice[] }>(`/products/${encodeURIComponent(productId)}/price`, { query: { locationId }, what: "Product" }),
    createPrice: (productId: string, body: Record<string, unknown>) => r<GhlPrice>(`/products/${encodeURIComponent(productId)}/price`, { method: "POST", body: { ...body, locationId } }),
    updatePrice: (productId: string, priceId: string, body: Record<string, unknown>) =>
      r<GhlPrice>(`/products/${encodeURIComponent(productId)}/price/${encodeURIComponent(priceId)}`, { method: "PUT", body: { ...body, locationId }, what: "Price" }),
    listInventory: (q: { limit: number; offset: number }) =>
      r<{ inventory: { _id: string; availableQuantity?: number | null; sku?: string | null; product?: string; name?: string }[]; total: number }>("/products/inventory", {
        query: { altId: locationId, altType: "location", ...q },
      }),
    updateInventory: (items: { priceId: string; availableQuantity: number }[]) =>
      r<{ status?: unknown; message?: string }>("/products/inventory", { method: "POST", body: { altId: locationId, altType: "location", items } }),

    // ── Orders & transactions (read-only; scope payments/orders.readonly, payments/transactions.readonly) ──
    getOrder: (orderId: string) => r<GhlOrder & { data?: GhlOrder }>(`/payments/orders/${encodeURIComponent(orderId)}`, { query: { altId: locationId, altType: "location" }, what: "Order" }),
    listOrders: (q: { startAt?: string; endAt?: string; limit: number; offset: number }) =>
      r<{ data: GhlOrder[]; totalCount: number }>("/payments/orders", { query: { altId: locationId, altType: "location", ...q } }),
    listOrderTransactions: (orderId: string) =>
      r<{ data: GhlTransaction[]; totalCount?: number }>("/payments/transactions", { query: { altId: locationId, altType: "location", entityId: orderId, limit: 100 } }),
  };
}

export type GhlApi = ReturnType<typeof ghlApi>;
