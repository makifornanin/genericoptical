/**
 * In-memory HighLevel (LeadConnector) simulator for automated tests. It implements only the endpoints
 * the integration calls, with response shapes taken from the official spec. It is NOT evidence that the
 * live API behaves this way — see docs/SYNC_TEST_PLAN.md for what still needs live verification.
 */
import { randomUUID } from "node:crypto";

type Json = Record<string, unknown>;
export type Call = { method: string; path: string; query: Record<string, string>; body: Json | null; auth: string | null; version: string | null };

export class FakeGhl {
  locations = new Map<string, { id: string; name: string; timezone: string; companyId: string }>();
  contacts = new Map<string, Json>();
  opportunities = new Map<string, Json>();
  pipelines: { id: string; name: string; stages: { id: string; name: string; position: number }[] }[] = [];
  /** Which `stages` form POST /opportunities/pipelines accepts (the docs show both). */
  pipelineStageFormat: "objects" | "strings" = "objects";
  calendars: { id: string; name: string; isActive: boolean }[] = [];
  users: { id: string; name: string; email: string }[] = [];
  appointments = new Map<string, Json>();
  products = new Map<string, Json>();
  prices = new Map<string, Json & { product: string }>();
  orders = new Map<string, Json>();
  transactions: Json[] = [];
  notes: { contactId: string; body: string }[] = [];
  calls: Call[] = [];
  /** Valid access tokens → location. Refresh tokens are single-use. */
  accessTokens = new Map<string, string>();
  refreshTokens = new Map<string, string>();
  tokenRequests: URLSearchParams[] = [];
  private failures: { match: (c: Call) => boolean; status: number; times: number; headers?: Record<string, string>; body?: Json; network?: boolean }[] = [];

  constructor(public locationId = "loc_TEST0001") {
    this.locations.set(locationId, { id: locationId, name: "Test Optical Sub-account", timezone: "Asia/Manila", companyId: "cmp_TEST" });
    this.accessTokens.set("pit-test-token-123456", locationId);
  }

  addLocation(id: string, name = `Sub-account ${id}`) {
    this.locations.set(id, { id, name, timezone: "Asia/Manila", companyId: "cmp_TEST" });
    return this;
  }

  /** Makes the next `times` matching calls fail with `status` (or a network error). */
  fail(match: string | ((c: Call) => boolean), status: number, opts: { times?: number; headers?: Record<string, string>; body?: Json; network?: boolean } = {}) {
    const m = typeof match === "string" ? (c: Call) => `${c.method} ${c.path}`.startsWith(match) : match;
    this.failures.push({ match: m, status, times: opts.times ?? 1, headers: opts.headers, body: opts.body, network: opts.network });
  }

  callsTo(prefix: string) {
    return this.calls.filter((c) => `${c.method} ${c.path}`.startsWith(prefix));
  }

  issueTokens(locationId: string) {
    const access = `at_${randomUUID()}`;
    const refresh = `rt_${randomUUID()}`;
    this.accessTokens.set(access, locationId);
    this.refreshTokens.set(refresh, locationId);
    return { access, refresh };
  }

  /** Expires every issued access token (forces a refresh). */
  expireAccessTokens() {
    for (const [t] of this.accessTokens) if (t.startsWith("at_")) this.accessTokens.delete(t);
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    // OAuth token endpoint (form-encoded).
    if (url.pathname === "/oauth/token") {
      const params = new URLSearchParams(String(init?.body ?? ""));
      this.tokenRequests.push(params);
      if (params.get("grant_type") === "authorization_code") {
        const code = params.get("code") ?? "";
        if (code.startsWith("company:")) return json({ access_token: "agency", refresh_token: "agency-r", expires_in: 86399, userType: "Company", companyId: "cmp_TEST" });
        const loc = code.replace(/^code:/, "");
        if (!this.locations.has(loc)) return json({ error: "invalid_grant", error_description: "Invalid code" }, 400);
        const t = this.issueTokens(loc);
        return json({ access_token: t.access, refresh_token: t.refresh, expires_in: 86399, scope: "contacts.readonly contacts.write", userType: "Location", locationId: loc, companyId: "cmp_TEST", userId: "usr_1" });
      }
      if (params.get("grant_type") === "refresh_token") {
        const rt = params.get("refresh_token") ?? "";
        const loc = this.refreshTokens.get(rt);
        if (!loc) return json({ error: "invalid_grant", error_description: "Refresh token is invalid or already used" }, 400);
        this.refreshTokens.delete(rt); // single-use
        const t = this.issueTokens(loc);
        return json({ access_token: t.access, refresh_token: t.refresh, expires_in: 86399, scope: "contacts.readonly contacts.write", userType: "Location", locationId: loc });
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as Json) : null;
    const call: Call = { method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: headers.get("authorization"), version: headers.get("version") };
    this.calls.push(call);
    const f = this.failures.find((x) => x.times > 0 && x.match(call));
    if (f) {
      f.times--;
      if (f.network) throw new TypeError("fetch failed");
      return json(f.body ?? { message: `Simulated HTTP ${f.status}` }, f.status, f.headers);
    }
    const token = (call.auth ?? "").replace(/^Bearer\s+/, "");
    if (!this.accessTokens.has(token)) return json({ message: "Invalid JWT" }, 401);
    try {
      return this.route(call);
    } catch (error) {
      if (error instanceof NotFound) return json({ message: "Not found" }, 404);
      throw error;
    }
  };

  private route(c: Call): Response {
    const p = c.path;
    const seg = p.split("/").filter(Boolean);
    const now = new Date().toISOString();
    // Locations
    if (c.method === "GET" && seg[0] === "locations" && seg.length === 2) {
      const loc = this.locations.get(seg[1]);
      if (!loc) throw new NotFound();
      return json({ location: loc });
    }
    if (c.method === "GET" && p === "/users/search") return json({ users: this.users, count: this.users.length });
    // Contacts
    if (seg[0] === "contacts") {
      if (c.method === "GET" && p === "/contacts/search/duplicate") {
        const email = c.query.email?.toLowerCase();
        const number = (c.query.number ?? "").replace(/\D/g, "");
        const found = [...this.contacts.values()].find((x) => (email && String(x.email ?? "").toLowerCase() === email) || (number && String(x.phone ?? "").replace(/\D/g, "") === number));
        return json({ contact: found ?? null });
      }
      if (c.method === "POST" && p === "/contacts/") {
        const id = `ct_${randomUUID().slice(0, 8)}`;
        const contact = { id, tags: [], ...c.body, dateAdded: now, dateUpdated: now };
        this.contacts.set(id, contact);
        return json({ contact });
      }
      const id = seg[1];
      const contact = this.contacts.get(id);
      if (!contact) throw new NotFound();
      if (seg[2] === "tags") {
        const tags = new Set((contact.tags as string[]) ?? []);
        for (const t of (c.body?.tags as string[]) ?? []) {
          if (c.method === "POST") tags.add(t);
          else tags.delete(t);
        }
        contact.tags = [...tags];
        return json({ tags: contact.tags });
      }
      if (seg[2] === "notes" && c.method === "POST") {
        this.notes.push({ contactId: id, body: String(c.body?.body ?? "") });
        return json({ note: { id: randomUUID(), body: c.body?.body } });
      }
      if (c.method === "GET") return json({ contact });
      if (c.method === "PUT") {
        Object.assign(contact, c.body, { dateUpdated: now });
        return json({ contact });
      }
    }
    // Opportunities
    if (seg[0] === "opportunities") {
      if (c.method === "GET" && p === "/opportunities/pipelines") return json({ pipelines: this.pipelines });
      if (c.method === "POST" && p === "/opportunities/pipelines") {
        // Documented: name, stages (≥ 1) and locationId required; names unique per location (case-insensitive).
        const name = String(c.body?.name ?? "");
        const stages = (c.body?.stages as unknown[]) ?? [];
        if (!name || !stages.length || c.body?.locationId !== this.locationId) return json({ message: "name, stages and locationId are required" }, 422);
        if (this.pipelines.some((x) => x.name.toLowerCase() === name.toLowerCase())) return json({ message: "Pipeline name already exists" }, 400);
        if (this.pipelineStageFormat === "strings" && stages.some((st) => typeof st !== "string")) return json({ message: "stages must be strings" }, 422);
        const pipeline = { id: `pl_${randomUUID().slice(0, 8)}`, name, stages: stages.map((st, i) => ({ id: `st_${randomUUID().slice(0, 8)}`, name: typeof st === "string" ? st : String((st as Json).name), position: i })) };
        this.pipelines.push(pipeline);
        return json({ pipeline }, 201);
      }
      if (c.method === "POST" && p === "/opportunities/") {
        for (const k of ["pipelineId", "name", "status", "contactId"]) if (!c.body?.[k]) return json({ message: `${k} is required` }, 422);
        const id = `op_${randomUUID().slice(0, 8)}`;
        const opp = { id, ...c.body, createdAt: now, updatedAt: now };
        this.opportunities.set(id, opp);
        return json({ opportunity: opp });
      }
      const opp = this.opportunities.get(seg[1]);
      if (!opp) throw new NotFound();
      if (c.method === "GET") return json({ opportunity: opp });
      if (c.method === "PUT") {
        Object.assign(opp, c.body, { updatedAt: new Date(Date.now() + 1).toISOString() });
        return json({ opportunity: opp });
      }
    }
    // Calendars & appointments
    if (c.method === "GET" && p === "/calendars/") return json({ calendars: this.calendars });
    if (seg[0] === "calendars" && seg[1] === "events" && seg[2] === "appointments") {
      if (c.method === "POST" && seg.length === 3) {
        if (!c.body?.calendarId || !c.body?.contactId || !c.body?.startTime) return json({ message: "calendarId, contactId and startTime are required" }, 422);
        const id = `ap_${randomUUID().slice(0, 8)}`;
        const appt = { id, ...c.body, dateAdded: now, dateUpdated: now };
        this.appointments.set(id, appt);
        return json(appt);
      }
      const appt = this.appointments.get(seg[3]);
      if (!appt) throw new NotFound();
      if (c.method === "GET") return json({ event: appt });
      if (c.method === "PUT") {
        Object.assign(appt, c.body, { dateUpdated: now });
        return json(appt);
      }
    }
    // Products, prices, inventory
    if (seg[0] === "products") {
      if (p === "/products/inventory") {
        if (c.method === "GET") return json({ inventory: [...this.prices.values()].map((x) => ({ _id: x._id, availableQuantity: x.availableQuantity ?? null, sku: x.sku, product: x.product, name: x.name })), total: this.prices.size });
        for (const item of (c.body?.items as { priceId: string; availableQuantity?: number }[]) ?? []) {
          const price = this.prices.get(item.priceId);
          if (!price) return json({ message: `Unknown price ${item.priceId}` }, 400);
          if (item.availableQuantity !== undefined) price.availableQuantity = item.availableQuantity;
        }
        return json({ status: true, message: "Inventory updated" });
      }
      if (c.method === "POST" && p === "/products/") {
        if (!c.body?.name || !c.body?.productType) return json({ message: "name and productType are required" }, 422);
        const id = `pr_${randomUUID().slice(0, 8)}`;
        this.products.set(id, { _id: id, ...c.body });
        return json({ _id: id, ...c.body });
      }
      const product = this.products.get(seg[1]);
      if (!product) throw new NotFound();
      if (seg[2] === "price") {
        if (c.method === "POST" && seg.length === 3) {
          for (const k of ["name", "type", "currency", "amount"]) if (c.body?.[k] === undefined) return json({ message: `${k} is required` }, 422);
          const id = `pc_${randomUUID().slice(0, 8)}`;
          const price = { _id: id, product: seg[1], ...c.body } as Json & { product: string };
          this.prices.set(id, price);
          return json(price);
        }
        if (c.method === "GET" && seg.length === 3) return json({ prices: [...this.prices.values()].filter((x) => x.product === seg[1]) });
        const price = this.prices.get(seg[3]);
        if (!price) throw new NotFound();
        if (c.method === "PUT") {
          Object.assign(price, c.body);
          return json(price);
        }
      }
      if (c.method === "PUT") {
        Object.assign(product, c.body);
        return json(product);
      }
    }
    // Orders & transactions (read-only, as in the real API)
    if (seg[0] === "payments") {
      if (c.method === "GET" && p === "/payments/orders") return json({ data: [...this.orders.values()], totalCount: this.orders.size });
      if (c.method === "GET" && seg[1] === "orders" && seg.length === 3) {
        const order = this.orders.get(seg[2]);
        if (!order) throw new NotFound();
        return json(order);
      }
      if (c.method === "GET" && p === "/payments/transactions") return json({ data: this.transactions.filter((t) => t.entityId === c.query.entityId) });
    }
    return json({ message: `Simulator has no route for ${c.method} ${p}` }, 501);
  }

  // ── Helpers to set up GHL-side state ──
  addOrder(order: { id: string; items: { priceId: string; qty: number; amount: number; name?: string }[]; amount: number; status?: string; contactId?: string | null }) {
    this.orders.set(order.id, {
      _id: order.id,
      altId: this.locationId,
      altType: "location",
      contactId: order.contactId ?? null,
      contactSnapshot: { firstName: "Online", lastName: "Buyer", email: `buyer-${order.id}@example.com` },
      currency: "PHP",
      amount: order.amount,
      status: order.status ?? "pending",
      liveMode: true,
      items: order.items.map((i) => ({ name: i.name ?? "Item", qty: i.qty, price: { _id: i.priceId, amount: i.amount, currency: "PHP" }, product: { _id: this.prices.get(i.priceId)?.product } })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  pay(orderId: string, amount: number, opts: { refunded?: number; id?: string } = {}) {
    this.transactions.push({ _id: opts.id ?? `tx_${randomUUID().slice(0, 8)}`, entityType: "order", entityId: orderId, amount, amountRefunded: opts.refunded ?? 0, status: "succeeded", createdAt: new Date().toISOString() });
    const order = this.orders.get(orderId);
    if (order) {
      order.status = "completed";
      order.updatedAt = new Date().toISOString();
    }
  }
}

class NotFound extends Error {}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
