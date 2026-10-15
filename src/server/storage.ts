import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { env } from "@/server/env";
import { invalid } from "@/server/services/core";

const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_BYTES = 5 * 1024 * 1024;

function root() {
  return resolve(env().UPLOAD_DIR);
}

/**
 * Local-disk attachment storage (outside /public, never directly web-served).
 * For serverless hosting replace with object storage (S3, R2, Vercel Blob) — see docs/DEPLOYMENT.md.
 */
export async function saveAttachment(businessId: string, file: File) {
  if (!ALLOWED.has(file.type)) throw invalid("Attach a PDF, JPG, PNG or WebP file.");
  if (file.size > MAX_BYTES) throw invalid("Attachments can be up to 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  // Basic magic-number check so a renamed file can't masquerade as an image/PDF.
  const sig = bytes.subarray(0, 4).toString("hex");
  const ok = (file.type === "application/pdf" && sig.startsWith("25504446")) || (file.type === "image/png" && sig === "89504e47") || (file.type === "image/jpeg" && sig.startsWith("ffd8")) || (file.type === "image/webp" && bytes.subarray(8, 12).toString() === "WEBP");
  if (!ok) throw invalid("The file content doesn't match its type.");
  const dir = join(root(), businessId);
  await mkdir(dir, { recursive: true });
  const key = `${businessId}/${randomUUID()}.${ALLOWED.get(file.type)}`;
  await writeFile(join(root(), key), bytes);
  return { path: key, name: file.name.slice(0, 120) };
}

/** Removes a stored attachment (orphans from failed saves, or a replaced receipt). Missing files are fine. */
export async function deleteAttachment(key: string | null | undefined) {
  if (!key) return;
  const full = resolve(root(), key);
  if (!full.startsWith(root() + sep)) return;
  await unlink(full).catch(() => undefined);
}

export async function readAttachment(key: string) {
  const full = resolve(root(), key);
  if (!full.startsWith(root() + sep)) throw invalid("Invalid attachment path.");
  const ext = key.split(".").pop() ?? "";
  const type = [...ALLOWED.entries()].find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { bytes: await readFile(full), type };
}
