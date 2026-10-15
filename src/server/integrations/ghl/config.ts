import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { GHL } from "./engine";

/**
 * Per-business GoHighLevel settings (stored in integration_connections.settings). Every sync area can
 * be switched off independently; mappings tell the integration which GHL pipeline/stages to use.
 */
export const ghlSettingsSchema = z.object({
  tagPrefix: z.string().trim().min(1).max(30).regex(/^[a-z0-9-]+$/i, "Letters, numbers and dashes.").default("specta"),
  stageTags: z.boolean().default(true),
  orderReadyTag: z.string().trim().min(1).max(40).default("order-ready"),
  /** "ghl" = GHL calendars are authoritative; dashboard changes go to GHL first. */
  appointmentsAuthority: z.enum(["platform", "ghl"]).default("platform"),
  sync: z
    .object({
      contacts: z.boolean().default(true),
      opportunities: z.boolean().default(true),
      appointments: z.boolean().default(true),
      products: z.boolean().default(false),
      inventory: z.boolean().default(false),
      sales: z.boolean().default(true),
      orders: z.boolean().default(false),
    })
    .default({ contacts: true, opportunities: true, appointments: true, products: false, inventory: false, sales: true, orders: false }),
  /** Pipeline where POS sales and customer orders appear as opportunities. */
  salesPipelineId: z.string().trim().max(80).nullable().default(null),
  stageMap: z
    .object({
      posCompleted: z.string().trim().max(80).nullable().default(null),
      orderOpen: z.string().trim().max(80).nullable().default(null),
      orderReady: z.string().trim().max(80).nullable().default(null),
      orderCompleted: z.string().trim().max(80).nullable().default(null),
    })
    .default({ posCompleted: null, orderOpen: null, orderReady: null, orderCompleted: null }),
  /** Local stockroom whose available quantity is published to GHL (GHL has one stock figure per price). */
  inventoryLocationId: z.string().uuid().nullable().default(null),
  /** Branch that imported GHL online orders are attributed to (its stockroom is deducted). */
  onlineBranchId: z.string().uuid().nullable().default(null),
});

export type GhlSettings = z.infer<typeof ghlSettingsSchema>;
export type SyncArea = keyof GhlSettings["sync"];

export function parseSettings(raw: unknown): GhlSettings {
  const parsed = ghlSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : ghlSettingsSchema.parse({});
}

export type ActiveConnection = { id: string; status: string; externalAccountId: string | null; settings: GhlSettings };

/** The business's GHL connection when it can carry sync traffic (connected, or temporarily erroring). */
export async function activeConnection(ex: Executor, businessId: string): Promise<ActiveConnection | null> {
  const [row] = await ex
    .select({ id: integrationConnections.id, status: integrationConnections.status, externalAccountId: integrationConnections.externalAccountId, settings: integrationConnections.settings })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  if (!row || !["connected", "error", "reauth_required"].includes(row.status)) return null;
  return { ...row, settings: parseSettings(row.settings) };
}
