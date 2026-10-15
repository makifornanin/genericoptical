/**
 * Reads a request body as text, stopping as soon as it exceeds `maxBytes` — so a missing or false
 * Content-Length (or a chunked upload) can't make the server buffer an unbounded body.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/**
 * Content-Disposition with an ASCII fallback plus the RFC 5987 UTF-8 name, so names with “smart quotes”,
 * en dashes, emoji or CJK characters still download (Node rejects raw non-Latin-1 header values).
 */
export function contentDisposition(name: string, disposition: "inline" | "attachment" = "inline") {
  const clean = name.replace(/[\r\n"]/g, "").slice(0, 150) || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Client IP from X-Forwarded-For, trusting only the last TRUST_PROXY_HOPS entries (those were added by
 * our own proxies). The left-most entry is whatever the client claimed and must not be trusted.
 */
export function clientIp(forwardedFor: string | null, realIp: string | null, trustedHops = Number(process.env.TRUST_PROXY_HOPS ?? 1)) {
  const chain = (forwardedFor ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (trustedHops > 0 && chain.length) return chain[Math.max(0, chain.length - trustedHops)] ?? null;
  return realIp || null;
}
