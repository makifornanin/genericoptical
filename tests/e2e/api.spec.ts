import { expect, test } from "@playwright/test";
import { REVALIDATE_SECRET } from "./helpers";

test.describe("POST /api/revalidate", () => {
  test("401 without a secret, with a wrong secret, and with the wrong scheme", async ({ request }) => {
    expect((await request.post("/api/revalidate", { data: { tags: ["site"] } })).status()).toBe(401);
    expect((await request.post("/api/revalidate", { headers: { Authorization: "Bearer wrong" }, data: { tags: ["site"] } })).status()).toBe(401);
    expect((await request.post("/api/revalidate", { headers: { "x-revalidate-secret": "wrong" }, data: { tags: ["site"] } })).status()).toBe(401);
    expect((await request.post("/api/revalidate", { headers: { Authorization: `Basic ${REVALIDATE_SECRET}` }, data: { tags: ["site"] } })).status()).toBe(401);
    const res = await request.post("/api/revalidate", { data: { tags: ["site"] } });
    expect(JSON.stringify(await res.json())).not.toContain(REVALIDATE_SECRET);
  });

  test("400 on unknown or missing tags", async ({ request }) => {
    const headers = { Authorization: `Bearer ${REVALIDATE_SECRET}` };
    expect((await request.post("/api/revalidate", { headers, data: { tags: ["everything"] } })).status()).toBe(400);
    expect((await request.post("/api/revalidate", { headers, data: { tags: [] } })).status()).toBe(400);
    expect((await request.post("/api/revalidate", { headers, data: {} })).status()).toBe(400);
  });

  test("200 with the bearer secret (dashboard) or the x-revalidate-secret header", async ({ request }) => {
    const a = await request.post("/api/revalidate", { headers: { Authorization: `Bearer ${REVALIDATE_SECRET}` }, data: { tags: ["catalog"] } });
    expect(a.status()).toBe(200);
    expect(await a.json()).toEqual({ revalidated: ["catalog"] });
    const b = await request.post("/api/revalidate", { headers: { "x-revalidate-secret": REVALIDATE_SECRET }, data: { tags: ["site", "catalog", "site"] } });
    expect(b.status()).toBe(200);
    expect(await b.json()).toEqual({ revalidated: ["site", "catalog"] });
  });
});

test.describe("GET /api/health", () => {
  test("reports the API status without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", api: "ok" });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});
