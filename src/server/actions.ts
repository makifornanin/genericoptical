import "server-only";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/types";
import { getSession } from "@/server/auth/session";
import { AppError, type Ctx } from "@/server/services/core";

/**
 * Wraps a Server Action body: resolves the signed-in context (never trusting the client),
 * runs the service call and converts failures into a typed result for the form.
 */
export async function runAction<T>(fn: (ctx: Ctx) => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired. Sign in again to continue." };
  return toResult(() => fn(session.ctx), successMessage);
}

export async function toResult<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (error) {
    return failure(error);
  }
}

export function failure(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> } {
  if (error instanceof AppError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = error.issues[0];
    return { ok: false, error: first ? `${first.path.length ? `${humanize(String(first.path[first.path.length - 1]))}: ` : ""}${first.message}` : "Check the highlighted fields.", fieldErrors };
  }
  // Next.js control-flow errors (redirect/notFound) must propagate.
  if (error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string" && String((error as { digest: string }).digest).startsWith("NEXT_")) throw error;
  console.error("[action] unexpected error", error);
  return { ok: false, error: "Something went wrong on our side. The change was not saved — please try again." };
}

function humanize(key: string) {
  const s = key.replace(/Cents$/, "").replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
