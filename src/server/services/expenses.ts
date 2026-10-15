import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { expenseInput } from "@/lib/schemas";
import { getDb } from "@/server/db";
import { branches, businessMemberships, expenseCategories, expenses, users } from "@/server/db/schema";
import { audit, db, diff, invalid, likePattern, mapDbError, notFound, now, pageOf, paging, requirePermission, type Ctx } from "./core";

export async function listExpenseCategories(ctx: Ctx) {
  return db()
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.businessId, ctx.businessId))
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

export async function createExpenseCategory(ctx: Ctx, name: string) {
  requirePermission(ctx, "expenses.manage");
  const clean = name?.trim();
  if (!clean || clean.length > 60) throw invalid("Enter a category name (up to 60 characters).");
  try {
    const [row] = await db().insert(expenseCategories).values({ businessId: ctx.businessId, name: clean, sortOrder: 100 }).returning();
    return row;
  } catch (error) {
    mapDbError(error);
  }
}

export type ExpenseFilter = { q?: string; categoryId?: string | null; branchId?: string | null; fromDay?: string; toDay?: string; status?: string | null; page?: number; pageSize?: number };

export async function listExpenses(ctx: Ctx, f: ExpenseFilter) {
  requirePermission(ctx, "expenses.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(expenses.businessId, ctx.businessId)];
  if (f.status) conds.push(sql`${expenses.status} = ${f.status}`);
  else conds.push(eq(expenses.status, "recorded"));
  if (f.categoryId) conds.push(eq(expenses.categoryId, f.categoryId));
  if (f.branchId) conds.push(eq(expenses.branchId, f.branchId));
  if (f.fromDay) conds.push(gte(expenses.expenseDate, f.fromDay));
  if (f.toDay) conds.push(lte(expenses.expenseDate, f.toDay));
  if (f.q) conds.push(sql`(${expenses.description} ilike ${likePattern(f.q)} or coalesce(${expenses.payee}, '') ilike ${likePattern(f.q)} or coalesce(${expenses.reference}, '') ilike ${likePattern(f.q)})`);
  const where = and(...conds);
  const rows = await db()
    .select({
      expense: expenses,
      categoryName: expenseCategories.name,
      branchName: branches.name,
      createdByName: users.name,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(branches, eq(branches.id, expenses.branchId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, expenses.createdByMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(where)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(pageSize)
    .offset(offset);
  const [totals] = await db()
    .select({ count: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::bigint` })
    .from(expenses)
    .where(where);
  const byCategory = await db()
    .select({ name: expenseCategories.name, sum: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::bigint` })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(where)
    .groupBy(expenseCategories.name)
    .orderBy(desc(sql`sum(${expenses.amountCents})`));
  return {
    ...pageOf(rows, Number(totals.count), page, pageSize),
    sumCents: Number(totals.sum),
    byCategory: byCategory.map((c) => ({ name: c.name, sumCents: Number(c.sum) })),
  };
}

async function assertRefs(ctx: Ctx, input: { categoryId: string; branchId: string | null }) {
  const [cat] = await db().select({ id: expenseCategories.id }).from(expenseCategories).where(and(eq(expenseCategories.businessId, ctx.businessId), eq(expenseCategories.id, input.categoryId))).limit(1);
  if (!cat) throw invalid("Choose a category.", { categoryId: ["Choose a category."] });
  if (input.branchId) {
    const [b] = await db().select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, input.branchId))).limit(1);
    if (!b) throw invalid("Unknown branch.");
  }
}

export async function saveExpense(ctx: Ctx, id: string | null, raw: unknown, attachment?: { path: string; name: string } | null) {
  requirePermission(ctx, "expenses.manage");
  const input = expenseInput.parse(raw);
  await assertRefs(ctx, input);
  try {
    return await getDb().transaction(async (tx) => {
      const at = now(ctx);
      if (!id) {
        const [row] = await tx
          .insert(expenses)
          .values({
            ...input,
            businessId: ctx.businessId,
            attachmentPath: attachment?.path ?? null,
            attachmentName: attachment?.name ?? null,
            createdByMembershipId: ctx.membershipId,
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        await audit(tx, ctx, { action: "expense.created", entityType: "expense", entityId: row.id, summary: `Recorded expense ${formatMoney(row.amountCents)} · ${row.description}` });
        return row;
      }
      const [existing] = await tx.select().from(expenses).where(and(eq(expenses.businessId, ctx.businessId), eq(expenses.id, id))).for("update");
      if (!existing) throw notFound("Expense");
      if (existing.status === "voided") throw invalid("Voided expenses can't be edited.");
      const [row] = await tx
        .update(expenses)
        .set({ ...input, ...(attachment ? { attachmentPath: attachment.path, attachmentName: attachment.name } : {}), updatedAt: at })
        .where(eq(expenses.id, id))
        .returning();
      await audit(tx, ctx, {
        action: "expense.updated",
        entityType: "expense",
        entityId: id,
        summary: `Updated expense ${formatMoney(row.amountCents)} · ${row.description}`,
        changes: diff(existing as unknown as Record<string, unknown>, input),
      });
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

/** Expenses are voided, never deleted, so reports stay reproducible. */
export async function voidExpense(ctx: Ctx, id: string, reason: string) {
  requirePermission(ctx, "expenses.manage");
  if (!reason?.trim()) throw invalid("Give a reason for voiding this expense.");
  const [row] = await db()
    .update(expenses)
    .set({ status: "voided", voidedAt: now(ctx), voidReason: reason.trim(), updatedAt: now(ctx) })
    .where(and(eq(expenses.businessId, ctx.businessId), eq(expenses.id, id), eq(expenses.status, "recorded")))
    .returning();
  if (!row) throw notFound("Expense");
  await audit(db(), ctx, { action: "expense.voided", entityType: "expense", entityId: id, summary: `Voided expense ${formatMoney(row.amountCents)} · ${row.description}: ${reason.trim()}` });
  return row;
}

export async function getExpenseAttachment(ctx: Ctx, id: string) {
  requirePermission(ctx, "expenses.view");
  const [row] = await db()
    .select({ path: expenses.attachmentPath, name: expenses.attachmentName })
    .from(expenses)
    .where(and(eq(expenses.businessId, ctx.businessId), eq(expenses.id, id)))
    .limit(1);
  if (!row?.path) throw notFound("Attachment");
  return row;
}
