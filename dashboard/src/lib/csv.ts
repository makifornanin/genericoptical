/** RFC 4180-style CSV helpers (quotes, embedded commas/newlines). */

const needsQuote = /[",\r\n]/;

/** Neutralises spreadsheet formula injection (cells starting with = + - @). */
function safeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}

export function toCsv(header: readonly string[], rows: unknown[][]): string {
  const line = (cells: unknown[]) =>
    cells
      .map((c) => {
        const s = safeCell(c);
        return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",");
  return [line([...header]), ...rows.map(line)].join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true; // quotes only open a field at its start (RFC 4180); a stray " inside a cell is literal
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new CsvError("The file has a quoted value that is never closed (a missing \"). Check the row near the end of the file.");
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/** Parses CSV text into objects keyed by the (lower-cased, trimmed) header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
