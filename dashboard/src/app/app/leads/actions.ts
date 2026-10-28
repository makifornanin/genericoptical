"use server";

import { refresh } from "next/cache";
import type { LeadStage } from "@/lib/schemas";
import { runAction } from "@/server/actions";
import * as leads from "@/server/services/leads";

export async function saveLeadAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const row = id ? await leads.updateLead(ctx, id, input) : await leads.createLead(ctx, input);
    refresh();
    return { id: row!.id };
  }, id ? "Lead updated" : "Lead added");
}

export async function changeStageAction(id: string, stage: LeadStage, note?: string) {
  return runAction(async (ctx) => {
    await leads.changeLeadStage(ctx, id, stage, note ?? null);
    refresh();
    return { id };
  }, "Stage updated");
}

export async function assignLeadAction(id: string, membershipId: string | null) {
  return runAction(async (ctx) => {
    await leads.assignLead(ctx, id, membershipId);
    refresh();
    return { id };
  }, "Lead assigned");
}

export async function addNoteAction(id: string, input: { body: string; type?: "note" | "call" | "email" | "sms"; followUpAt?: string | null }) {
  return runAction(async (ctx) => {
    await leads.addLeadNote(ctx, id, input);
    refresh();
    return { id };
  }, "Saved to timeline");
}

export async function setFollowUpAction(id: string, at: string | null) {
  return runAction(async (ctx) => {
    await leads.setLeadFollowUp(ctx, id, at ? new Date(at) : null);
    refresh();
    return { id };
  }, at ? "Follow-up scheduled" : "Follow-up cleared");
}

export async function convertLeadAction(id: string, customerId: string | null) {
  return runAction(async (ctx) => {
    const res = await leads.convertLead(ctx, id, { customerId });
    refresh();
    return res!;
  });
}

export async function duplicatesAction(id: string) {
  return runAction((ctx) => leads.duplicateCandidates(ctx, id));
}

export async function archiveLeadAction(id: string) {
  return runAction(async (ctx) => {
    await leads.archiveLead(ctx, id);
    refresh();
    return { id };
  }, "Lead archived");
}
