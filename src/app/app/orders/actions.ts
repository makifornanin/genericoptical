"use server";

import { runAction } from "@/server/actions";
import { can } from "@/server/services/core";
import { listPrescriptions } from "@/server/services/customers";

/** Prescriptions to attach to lens lines (only for roles allowed to see clinical records). */
export async function customerPrescriptionsAction(customerId: string) {
  return runAction(async (ctx) => {
    if (!can(ctx, "prescriptions.view")) return [];
    const rows = await listPrescriptions(ctx, customerId);
    return rows.map(({ rx }) => ({ id: rx.id, label: `${rx.kind === "contact_lens" ? "CL" : "Rx"} · ${rx.examinedOn} · OD ${rx.odSphere ?? "—"} / OS ${rx.osSphere ?? "—"}` }));
  });
}
