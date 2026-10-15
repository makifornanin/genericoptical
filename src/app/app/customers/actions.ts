"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as customers from "@/server/services/customers";

export async function saveCustomerAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const row = id ? await customers.updateCustomer(ctx, id, input) : await customers.createCustomer(ctx, input);
    refresh();
    return { id: row!.id, code: row!.code, firstName: row!.firstName, lastName: row!.lastName };
  }, id ? "Customer updated" : "Customer added");
}

export async function archiveCustomerAction(id: string, archived: boolean) {
  return runAction(async (ctx) => {
    await customers.setCustomerArchived(ctx, id, archived);
    refresh();
    return { id };
  }, archived ? "Customer archived" : "Customer restored");
}

export async function savePrescriptionAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const res = await customers.savePrescription(ctx, id, input);
    refresh();
    return res!;
  }, "Prescription saved");
}

export async function searchCustomersAction(q: string) {
  return runAction((ctx) => customers.searchCustomers(ctx, q));
}
