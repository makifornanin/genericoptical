#!/usr/bin/env node
/*
 * Tiny static server for the local preview (preview tooling only). Serves the repository root so the
 * preview pages can load ../../styles, ../../scripts and ../../assets exactly as built.
 *   node previews/serve.mjs            → http://localhost:4310/previews/site/index.html
 *   PORT=5000 node previews/serve.mjs
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4310);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (path === "" || path === ".") path = "previews/site/_pages.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw Object.assign(new Error("forbidden"), { code: 403 });
    const info = await stat(file).catch(() => null);
    const target = info && info.isDirectory() ? join(file, "index.html") : file;
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": TYPES[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { "Content-Type": "text/plain" });
    res.end(e.code === 403 ? "Forbidden" : "Not found");
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}/previews/site/index.html`));
