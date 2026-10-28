"use client";

import { CalendarClock, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { LEAD_INTEREST_LABELS, LEAD_STAGE_LABELS, LEAD_STAGES, type LeadStage } from "@/lib/schemas";
import { changeStageAction } from "../leads/actions";

export type BoardLead = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  interest: string | null;
  stage: LeadStage;
  estimatedValueCents: number | null;
  assignedName: string | null;
  followUpAt: string | null;
  createdAt: string;
};

const STAGE_RULE: Record<LeadStage, string> = {
  new: "#4d3fb0",
  contacted: "#86888d",
  qualified: "#7da628",
  appointment_scheduled: "#c48a12",
  follow_up: "#c5701f",
  converted: "#2e6b35",
  lost: "#b42318",
};

export function PipelineBoard({ leads, currency, locale, canManage }: { leads: BoardLead[]; currency: string; locale: string; canManage: boolean }) {
  const [now] = useState(() => Date.now());
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, move] = useOptimistic(leads, (state, p: { id: string; stage: LeadStage }) => state.map((l) => (l.id === p.id ? { ...l, stage: p.stage } : l)));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null);

  const doMove = (id: string, stage: LeadStage, reason?: string) => {
    const lead = optimistic.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === "converted") {
      router.push(`/app/leads/${id}`);
      toast.info("Use “Convert to customer” on the lead to convert it.");
      return;
    }
    if (stage === "lost" && !reason) {
      setLost({ id, reason: "" });
      return;
    }
    start(async () => {
      move({ id, stage });
      const res = await changeStageAction(id, stage, reason);
      if (!res.ok) toast.error(res.error);
      else toast.success(`${lead.firstName} moved to ${LEAD_STAGE_LABELS[stage]}`);
    });
  };

  return (
    <>
      <div className={cn("scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8", pending && "cursor-progress")}>
        {LEAD_STAGES.map((stage) => {
          const items = optimistic.filter((l) => l.stage === stage);
          const value = items.reduce((s, l) => s + (l.estimatedValueCents ?? 0), 0);
          return (
            <section
              key={stage}
              aria-label={LEAD_STAGE_LABELS[stage]}
              className={cn("flex w-[272px] shrink-0 flex-col rounded-[14px] border bg-surface-2 transition-colors", over === stage ? "border-ink/40 bg-muted-soft" : "border-line")}
              onDragOver={(e) => {
                if (!canManage) return;
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) doMove(id, stage);
              }}
            >
              <header className="border-b border-line px-3.5 pt-3 pb-2.5" style={{ boxShadow: `inset 0 2px 0 ${STAGE_RULE[stage]}`, borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">{LEAD_STAGE_LABELS[stage]}</h2>
                  <span className="text-[12px] text-text-3 tabular">{items.length}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-text-3 tabular">{value ? formatMoney(value, currency, locale, { compact: true }) : "—"} est. value</p>
              </header>
              <ul className="scroll-thin flex max-h-[calc(100vh-290px)] min-h-[120px] flex-col gap-2 overflow-y-auto p-2.5">
                {items.length === 0 ? <li className="py-6 text-center text-[12px] text-text-3">No leads</li> : null}
                {items.map((l) => {
                  const overdue = l.followUpAt && new Date(l.followUpAt).getTime() < now && stage !== "converted" && stage !== "lost";
                  return (
                    <li
                      key={l.id}
                      draggable={canManage}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", l.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(l.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn("rounded-[10px] border border-line bg-surface p-3 shadow-[0_1px_0_rgb(24_25_27/0.03)]", canManage && "cursor-grab active:cursor-grabbing", dragging === l.id && "opacity-50")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/app/leads/${l.id}`} className="min-w-0 text-[13px] leading-snug font-medium hover:underline">
                          {l.firstName} {l.lastName}
                        </Link>
                        {canManage ? (
                          <Menu>
                            <MenuTrigger asChild>
                              <button type="button" aria-label={`Move ${l.firstName} ${l.lastName}`} className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-text-3 hover:bg-muted-soft hover:text-text">
                                <MoreHorizontal className="size-4" />
                              </button>
                            </MenuTrigger>
                            <MenuContent>
                              <MenuLabel>Move to</MenuLabel>
                              {LEAD_STAGES.filter((s) => s !== l.stage).map((s) => (
                                <MenuItem key={s} onSelect={() => doMove(l.id, s)}>
                                  {LEAD_STAGE_LABELS[s]}
                                </MenuItem>
                              ))}
                            </MenuContent>
                          </Menu>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-text-3">
                        {l.code}
                        {l.interest ? ` · ${LEAD_INTEREST_LABELS[l.interest] ?? l.interest}` : ""}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-medium tabular">{l.estimatedValueCents ? formatMoney(l.estimatedValueCents, currency, locale) : <span className="text-text-3">No value</span>}</span>
                        {l.assignedName ? <Avatar name={l.assignedName} size={22} /> : <span className="text-[11px] text-text-3">Unassigned</span>}
                      </div>
                      {l.followUpAt && stage !== "converted" && stage !== "lost" ? (
                        <p className={cn("mt-2 flex items-center gap-1 text-[11.5px]", overdue ? "font-medium text-neg" : "text-text-3")}>
                          <CalendarClock className="size-3.5" />
                          {overdue ? "Overdue · " : ""}
                          {new Date(l.followUpAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <DialogRoot open={Boolean(lost)} onOpenChange={(o) => !o && setLost(null)}>
        <DialogContent
          size="sm"
          title="Mark lead as lost"
          footer={
            <>
              <Button variant="ghost" onClick={() => setLost(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!lost?.reason.trim()}
                onClick={() => {
                  if (!lost) return;
                  doMove(lost.id, "lost", lost.reason.trim());
                  setLost(null);
                }}
              >
                Mark as lost
              </Button>
            </>
          }
        >
          <TextareaField label="Reason" autoFocus value={lost?.reason ?? ""} onChange={(e) => setLost((p) => (p ? { ...p, reason: e.target.value } : p))} placeholder="e.g. Went with another shop" />
        </DialogContent>
      </DialogRoot>
    </>
  );
}
