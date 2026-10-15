import { getTableName, sql, type Column } from "drizzle-orm";
import type { Permission, Role } from "@/lib/permissions";
import { getDb, type Executor } from "@/server/db";
import { auditLogs } from "@/server/db/schema";

/** Who is acting, for which business, with which permissions. Every service call receives one. */
export type Ctx = {
  userId: string | null;
  membershipId: string | null;
  businessId: string;
  role: Role | "system";
  permissions: ReadonlySet<Permission>;
  actorLabel: string;
  branchId: string | null;
  ip?: string | null;
  /** Clock override for seeding historical data and tests. Never derived from user input. */
  now?: () => Date;
};

export type ErrorCode = "unauthorized" | "forbidden" | "not_found" | "validation" | "conflict";

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = "validation",
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Record") => new AppError(`${what} not found.`, "not_found");
export const forbidden = (message = "You don't have permission to do that.") => new AppError(message, "forbidden");
export const conflict = (message: string) => new AppError(message, "conflict");
export const invalid = (message: string, fieldErrors?: Record<string, string[]>) => new AppError(message, "validation", fieldErrors);

export function can(ctx: Ctx, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: Ctx, ...permissions: Permission[]): void {
  for (const p of permissions) if (!ctx.permissions.has(p)) throw forbidden();
}

export function requireAny(ctx: Ctx, ...permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.has(p))) throw forbidden();
}

export const now = (ctx: Ctx) => (ctx.now ? ctx.now() : new Date());

export const db = () => getDb();

/** Context for unauthenticated, server-originated work (website forms, webhooks, seeding). */
export function systemCtx(businessId: string, actorLabel = "System", permissions: Permission[] = []): Ctx {
  return {
    userId: null,
    membershipId: null,
    businessId,
    role: "system",
    permissions: new Set(permissions),
    actorLabel,
    branchId: null,
  };
}

/**
 * Fully qualified column reference for use inside raw SQL subqueries. Drizzle renders columns
 * unqualified when the outer query has no joins, and Postgres would then resolve `"id"` against
 * the subquery's own table — silently comparing the wrong column. Always use ref() for outer
 * references inside `(select … where x = ${ref(table.col)})`.
 */
export function ref(column: Column) {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function audit(
  ex: Executor,
  ctx: Ctx,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string; changes?: Record<string, unknown> | null },
) {
  await ex.insert(auditLogs).values({
    businessId: ctx.businessId,
    actorMembershipId: ctx.membershipId,
    actorLabel: ctx.actorLabel,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    changes: entry.changes ?? null,
    ip: ctx.ip ?? null,
    createdAt: now(ctx),
  });
}

/** Shallow diff for audit entries: only the fields that changed. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key as keyof T];
    if (b === undefined) continue;
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) changes[key] = { from: norm(a), to: norm(b) };
  }
  return changes;
}

// ─── Sequential document numbers ─────────────────────────────────────────────

/** Atomically allocates the next number for a business-scoped sequence (row-locked upsert). */
export async function nextNumber(ex: Executor, businessId: string, key: string, prefix: string, pad = 6): Promise<string> {
  const result = await ex.execute<{ value: number }>(sql`
    insert into business_sequences (business_id, key, value) values (${businessId}, ${key}, 1)
    on conflict (business_id, key) do update set value = business_sequences.value + 1
    returning value
  `);
  const value = Number(result.rows[0].value);
  return `${prefix}${String(value).padStart(pad, "0")}`;
}

// ─── Database error mapping ──────────────────────────────────────────────────

type PgError = { code?: string; constraint?: string; detail?: string };

function pgErrorOf(error: unknown): PgError | null {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const candidate = e as PgError & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    e = candidate.cause;
  }
  return null;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  inventory_balances_non_negative: "Not enough stock available for this change.",
  appointments_no_practitioner_overlap: "That practitioner already has an appointment at this time.",
  product_variants_business_id_sku_unique: "Another product already uses this SKU.",
  product_variants_barcode_key: "Another product already uses this barcode.",
  payments_reference_key: "A payment with this reference number has already been recorded.",
  customers_converted_lead_key: "This lead has already been converted to a customer.",
  users_email_lower_key: "An account with this email already exists.",
  sales_amounts: "This change would make the sale's totals inconsistent.",
  sale_items_amounts: "Refund quantity exceeds what was sold.",
  purchase_order_items_quantities: "Received quantity can't exceed the quantity ordered.",
  suppliers_business_id_code_unique: "Another supplier already uses this code.",
  branches_business_id_code_unique: "Another branch already uses this code.",
  product_categories_business_id_slug_unique: "A category with this name already exists.",
  expense_categories_business_id_name_unique: "An expense category with this name already exists.",
  business_memberships_business_id_user_id_unique: "This person is already a member of the business.",
};

/** Converts constraint violations into user-facing AppErrors; rethrows anything else unchanged. */
export function mapDbError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const pg = pgErrorOf(error);
  if (pg?.code) {
    const known = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
    if (pg.code === "23505") throw conflict(known ?? "A record with these details already exists.");
    if (pg.code === "23514") throw invalid(known ?? "The values entered aren't allowed.");
    if (pg.code === "23P01") throw conflict(known ?? "This overlaps an existing booking.");
    if (pg.code === "23503") throw invalid(known ?? "A linked record doesn't exist or belongs to another business.");
    if (pg.code === "40001" || pg.code === "40P01") throw conflict("Another change happened at the same time. Please try again.");
  }
  throw error;
}

/** Runs work in a transaction and maps constraint errors. */
export async function inTx<T>(fn: (tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  try {
    return await getDb().transaction(fn);
  } catch (error) {
    mapDbError(error);
  }
}

/** True when the error is a unique violation on the given constraint (for idempotency replays). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgErrorOf(error);
  return pg?.code === "23505" && (!constraint || pg.constraint === constraint);
}

// ─── Pagination helpers ──────────────────────────────────────────────────────

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paging(input: { page?: number; pageSize?: number }, maxSize = 100) {
  const pageSize = Math.min(Math.max(1, Math.floor(input.pageSize ?? 25)), maxSize);
  const page = Math.max(1, Math.floor(input.page ?? 1));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageOf<T>(rows: T[], total: number, page: number, pageSize: number): Page<T> {
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapes LIKE wildcards in user search input. */
export function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
