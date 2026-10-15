import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, parseCsvRecords } from "@/lib/csv";
import { isRealDay, resolveRange } from "@/lib/dates";
import { clientIp, contentDisposition, readBodyCapped } from "@/server/http";

describe("B5: client IP behind proxies", () => {
  it("trusts only the entry added by our own proxy, not what the client put in X-Forwarded-For", () => {
    // The client sent "1.1.1.1"; our single proxy appended the real address.
    expect(clientIp("1.1.1.1, 203.0.113.9", null, 1)).toBe("203.0.113.9");
    // Two trusted hops: client → CDN → load balancer.
    expect(clientIp("1.1.1.1, 198.51.100.4, 10.0.0.2", null, 2)).toBe("198.51.100.4");
    // Rotating the spoofed value doesn't change the result.
    expect(clientIp("9.9.9.9, 203.0.113.9", null, 1)).toBe(clientIp("8.8.8.8, 203.0.113.9", null, 1));
  });

  it("falls back to X-Real-IP without a forwarded chain, or when no proxy is trusted", () => {
    expect(clientIp(null, "192.0.2.7", 1)).toBe("192.0.2.7");
    expect(clientIp("1.1.1.1", "192.0.2.7", 0)).toBe("192.0.2.7");
    expect(clientIp(null, null, 1)).toBeNull();
  });
});

describe("B9: attachment file names", () => {
  it("keeps an ASCII fallback and the UTF-8 name, so Node accepts the header", () => {
    const h = contentDisposition("Receipt – “Café” 東京.pdf");
    expect(h).toMatch(/^inline; filename="Receipt _ _Caf__ __.pdf"; filename\*=UTF-8''/);
    expect(decodeURIComponent(h.split("UTF-8''")[1])).toBe("Receipt – “Café” 東京.pdf");
    // Every character is a legal header byte.
    expect(/^[\x20-\x7e]*$/.test(h)).toBe(true);
    expect(() => new Headers({ "Content-Disposition": h })).not.toThrow();
  });

  it("strips quotes and line breaks (no header injection)", () => {
    const h = contentDisposition('a"b\r\nSet-Cookie: x=1.pdf', "attachment");
    expect(h).not.toMatch(/\r|\n/);
    expect(h.startsWith('attachment; filename="abSet-Cookie: x=1.pdf"')).toBe(true);
  });
});

describe("A12: CSV parsing edge cases", () => {
  it("treats a stray quote inside a cell as a literal character", () => {
    expect(parseCsv('sku,label\nA-1,14" frame\n')).toEqual([
      ["sku", "label"],
      ["A-1", '14" frame'],
    ]);
  });

  it("rejects a quoted value that is never closed instead of swallowing the rest of the file", () => {
    expect(() => parseCsv('sku,label\nA-1,"open\nA-2,next\n')).toThrow(CsvError);
  });

  it("still handles RFC 4180 quoting (embedded commas, quotes and newlines)", () => {
    const rows = parseCsvRecords('sku,description\nA-1,"Line one\nLine ""two"", ok"\n');
    expect(rows).toEqual([{ sku: "A-1", description: 'Line one\nLine "two", ok' }]);
  });
});

describe("A19: report date ranges", () => {
  it("rejects impossible calendar days instead of rolling them over", () => {
    expect(isRealDay("2026-02-28")).toBe(true);
    expect(isRealDay("2028-02-29")).toBe(true);
    expect(isRealDay("2026-02-30")).toBe(false);
    expect(isRealDay("2026-13-01")).toBe(false);
    expect(isRealDay("0000-00-00")).toBe(false);
    expect(isRealDay("9999-12-31")).toBe(false);
  });

  it("falls back to the last 30 days for an invalid custom range", () => {
    const now = new Date("2026-06-15T04:00:00Z");
    const bad = resolveRange("custom", "Asia/Manila", { from: "2026-13-45", to: "2026-02-30" }, now);
    const fallback = resolveRange("30d", "Asia/Manila", undefined, now);
    expect(bad.fromDay).toBe(fallback.fromDay);
    expect(bad.toDay).toBe(fallback.toDay);
  });
});

describe("B11: request bodies are read with a size cap", () => {
  it("stops reading once the limit is passed, without trusting Content-Length", async () => {
    const big = new Request("http://localhost/hook", { method: "POST", body: "x".repeat(300_000) });
    expect(await readBodyCapped(big, 256 * 1024)).toBeNull();
    const small = new Request("http://localhost/hook", { method: "POST", body: JSON.stringify({ ok: true }) });
    expect(await readBodyCapped(small, 256 * 1024)).toBe('{"ok":true}');
  });
});
