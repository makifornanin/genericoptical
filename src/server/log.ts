/**
 * Structured, single-line JSON logging for the server. One object per line keeps logs greppable
 * locally and machine-parseable by any log drain (Vercel, Datadog, Loki…).
 *
 * Never log secrets: tokens, passwords, webhook secrets or full request bodies. `redact()` masks
 * known-sensitive keys defensively, but callers should pass identifiers, not payloads.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const env = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "warn" : "info")).toLowerCase() as Level;
  return ORDER[env] ?? ORDER.info;
}

const SENSITIVE = /token|secret|password|authorization|cookie|apikey|api_key|credential/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

export function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { error: String(error) };
  const e = error as Error & { code?: unknown; status?: unknown; constraint?: unknown; cause?: unknown };
  return {
    error: e.message,
    errorName: e.name,
    ...(e.code !== undefined ? { errorCode: e.code } : {}),
    ...(e.status !== undefined ? { httpStatus: e.status } : {}),
    ...(e.constraint !== undefined ? { constraint: e.constraint } : {}),
    ...(process.env.NODE_ENV !== "production" && e.stack ? { stack: e.stack.split("\n").slice(0, 6).join("\n") } : {}),
  };
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(fields ? (redact(fields) as Record<string, unknown>) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type Logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  child: (bound: Record<string, unknown>) => Logger;
};

function make(bound: Record<string, unknown>): Logger {
  const merge = (f?: Record<string, unknown>) => ({ ...bound, ...f });
  return {
    debug: (m, f) => write("debug", m, merge(f)),
    info: (m, f) => write("info", m, merge(f)),
    warn: (m, f) => write("warn", m, merge(f)),
    error: (m, f) => write("error", m, merge(f)),
    child: (more) => make({ ...bound, ...more }),
  };
}

export const log = make({});
