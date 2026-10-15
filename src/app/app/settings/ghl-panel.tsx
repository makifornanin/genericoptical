"use client";

import { Copy, Link2, PlugZap, RefreshCw, RotateCcw, ScanSearch, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, FormError, Select, SelectField, TextField } from "@/components/ui/form";
import { Pill, type Tone } from "@/components/ui/pill";
import { Table, TableWrap, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import type { GhlOverview } from "@/server/integrations/ghl";
import {
  connectGhlTokenAction,
  disconnectGhlAction,
  dismissGhlEventsAction,
  mapGhlCalendarAction,
  mapGhlUserAction,
  queueGhlSyncAction,
  reconcileGhlAction,
  resolveMismatchAction,
  retryGhlEventsAction,
  saveGhlSettingsAction,
  startGhlOAuthAction,
  syncGhlNowAction,
} from "./actions";

export const CATEGORY_LABELS: Record<string, string> = {
  contacts: "Contacts & leads",
  opportunities: "Opportunities",
  appointments: "Appointments",
  products: "Products",
  inventory: "Inventory",
  sales: "POS sales → CRM",
  orders: "Online orders",
  system: "Setup",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  retry_scheduled: { label: "Retry scheduled", tone: "warning" },
  synced: { label: "Synced", tone: "positive" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "negative" },
  needs_review: { label: "Needs review", tone: "warning" },
};

export function SyncStatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Pill tone={s.tone} dot>{s.label}</Pill>;
}

const CONNECTION: Record<string, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "positive" },
  error: { label: "Connection error", tone: "negative" },
  reauth_required: { label: "Reconnect required", tone: "warning" },
  disabled: { label: "Disconnected", tone: "neutral" },
  not_configured: { label: "Not connected", tone: "neutral" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-36 shrink-0 text-[12px] text-text-3">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-[8px] bg-surface-2 px-2 py-1.5 font-mono text-[12px]">{value}</code>
      <Button size="icon-sm" variant="ghost" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
        <Copy />
      </Button>
    </div>
  );
}

// ─── Connection ──────────────────────────────────────────────────────────────

export function GhlConnectionCard({ overview, flash }: { overview: GhlOverview; flash: { kind: "connected" | "error"; message: string } | null }) {
  const c = overview.connection;
  const status = c?.status ?? "not_configured";
  const live = status === "connected" || status === "error" || status === "reauth_required";
  const s = CONNECTION[status] ?? CONNECTION.not_configured;
  const oauth = useAction(startGhlOAuthAction, { silent: true, onSuccess: (url) => window.location.assign(url) });
  const sync = useAction(syncGhlNowAction, { success: (r) => (r.paused ? `Paused: ${r.paused.replace("_", " ")}` : `Processed ${r.claimed}: ${r.synced} synced, ${r.retried} retrying, ${r.failed + r.review} need attention`) });
  const reconcile = useAction(reconcileGhlAction);
  const disconnect = useAction(disconnectGhlAction);
  const [forget, setForget] = useState(false);
  return (
    <Card>
      <CardHeader title="GoHighLevel" subtitle="One GHL sub-account per business. GHL runs the website, forms, booking and marketing CRM; the dashboard stays the source of truth for stock, sales and payments." actions={<Pill tone={s.tone} dot>{s.label}</Pill>} />
      <CardBody className="flex flex-col gap-5">
        {flash ? (
          <p className={flash.kind === "connected" ? "rounded-[10px] bg-pos-soft px-3 py-2.5 text-[12.5px] text-pos" : "rounded-[10px] bg-neg-soft px-3 py-2.5 text-[12.5px] text-neg"} role="status">
            {flash.message}
          </p>
        ) : null}
        {status === "reauth_required" ? (
          <p className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">GoHighLevel stopped accepting the stored authorisation. Changes are queued safely — reconnect to resume syncing.</p>
        ) : null}
        {live && c ? (
          <DetailList
            items={[
              { label: "Sub-account", value: c.accountName ? `${c.accountName} · ${c.locationId}` : c.locationId ?? "—" },
              { label: "Connected with", value: c.authType === "oauth" ? "Marketplace app (OAuth)" : "Private Integration token" },
              { label: "Connected", value: when(c.connectedAt) },
              { label: "Last successful sync", value: when(c.lastSuccessAt) },
              ...(c.authType === "oauth" ? [{ label: "Access token renews", value: when(c.tokenExpiresAt) }] : []),
              ...(c.rateLimitedUntil && new Date(c.rateLimitedUntil) > new Date() ? [{ label: "Rate limited until", value: when(c.rateLimitedUntil) }] : []),
              ...(c.lastError ? [{ label: "Last error", value: <span className="text-neg">{c.lastError}</span> }] : []),
            ]}
          />
        ) : (
          <p className="rounded-[10px] bg-muted-soft px-3 py-2.5 text-[12.5px] text-text-2">
            Nothing is sent to or accepted from GoHighLevel until a sub-account is connected and verified. {c?.lastError ? <span className="text-neg">Last error: {c.lastError}</span> : null}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {overview.oauthAvailable ? (
            <Button variant="primary" loading={oauth.pending} onClick={() => oauth.run()}>
              <PlugZap /> {live ? "Reconnect" : "Connect GoHighLevel"}
            </Button>
          ) : null}
          {!live || c?.authType === "private_token" ? <PrivateTokenDialog defaultLocation={c?.locationId ?? ""} primary={!overview.oauthAvailable && !live} /> : null}
          {live ? (
            <>
              <Button loading={sync.pending} onClick={() => sync.run()}>
                <RefreshCw /> Sync now
              </Button>
              <Button loading={reconcile.pending} onClick={() => reconcile.run()}>
                <ScanSearch /> Run reconciliation
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="danger">
                    <Unplug /> Disconnect
                  </Button>
                }
                title="Disconnect GoHighLevel?"
                description="Tokens are deleted immediately and queued changes stop. Leads, customers, appointments and sales in the dashboard are kept."
                confirmLabel="Disconnect"
                onConfirm={async () => (await disconnect.run(forget)).ok}
              />
            </>
          ) : null}
        </div>
        {live ? (
          <Checkbox
            label="When disconnecting, also forget sync data"
            description="Removes GHL mirrors and mappings so a different sub-account can be connected. Dashboard records are never deleted."
            checked={forget}
            onChange={(e) => setForget(e.target.checked)}
          />
        ) : null}
        {!overview.oauthAvailable ? (
          <p className="text-[12px] text-text-3">The marketplace app isn&apos;t configured on this server (GHL_CLIENT_ID / GHL_CLIENT_SECRET), so only the Private Integration option is available. See docs/GHL_SETUP_GUIDE.md.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PrivateTokenDialog({ defaultLocation, primary }: { defaultLocation: string; primary: boolean }) {
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(defaultLocation);
  const [token, setToken] = useState("");
  const act = useAction(connectGhlTokenAction, { onSuccess: () => (setOpen(false), setToken("")) });
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={primary ? "primary" : "secondary"}>
          <Link2 /> {primary ? "Connect with a token" : "Use a Private Integration token"}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Connect with a Private Integration token"
        description="For a single sub-account without the marketplace app. The token is verified against the sub-account, then stored encrypted; it is never shown again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={act.pending} disabled={!loc || !token} onClick={() => act.run({ locationId: loc, token })}>
              Verify &amp; connect
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Sub-account (location) ID" value={loc} onChange={(e) => setLoc(e.target.value)} error={act.fe("locationId")} />
          <TextField label="Private Integration token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} error={act.fe("token")} hint="Give it the scopes listed in docs/GHL_SETUP_GUIDE.md." />
          <FormError message={act.error} />
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

// ─── Sync status ─────────────────────────────────────────────────────────────

export function GhlSyncStatus({ overview }: { overview: GhlOverview }) {
  const areas = ["contacts", "opportunities", "appointments", "products", "inventory", "sales", "orders"] as const;
  const enabled = (a: string) => (a === "sales" ? overview.settings.sync.sales : (overview.settings.sync as Record<string, boolean>)[a]);
  return (
    <Card>
      <CardHeader title="Synchronisation" subtitle="Per area: queued, needing attention, and when GoHighLevel last confirmed a change." />
      {overview.backlog.stale || overview.backlog.stuckEvents ? (
        <p role="status" className="mx-4 mb-3 rounded-[10px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          {overview.backlog.stale && overview.backlog.oldestQueuedAt
            ? `Changes have been waiting to sync since ${new Date(overview.backlog.oldestQueuedAt).toLocaleString()}. Check that the scheduled sync worker is running and the connection is healthy, or use Sync now.`
            : null}
          {overview.backlog.stuckEvents ? ` ${overview.backlog.stuckEvents} event(s) were left mid-send by a stopped worker; the next run picks them up again.` : null}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
        {areas.map((a) => {
          const s = overview.byCategory[a] ?? { pending: 0, synced: 0, failed: 0, review: 0, lastSyncedAt: null };
          const problems = s.failed + s.review;
          return (
            <a key={a} href={`/app/settings?tab=integrations&ghl=log&category=${a}`} className="block bg-surface px-4 py-3 hover:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-text-2">{CATEGORY_LABELS[a]}</p>
                {enabled(a) ? null : <span className="text-[11px] text-text-3">Off</span>}
              </div>
              <p className={problems ? "mt-1 text-[19px] font-semibold tabular text-neg" : "mt-1 text-[19px] font-semibold tabular"}>{problems ? `${problems} to fix` : s.pending ? `${s.pending} queued` : enabled(a) ? "Up to date" : "—"}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-text-3">{s.lastSyncedAt ? `Last synced ${new Date(s.lastSyncedAt).toLocaleString()}` : "Nothing synced yet"}</p>
            </a>
          );
        })}
        <a href="/app/settings?tab=integrations&ghl=overview#findings" className="block bg-surface px-4 py-3 hover:bg-surface-2">
          <p className="text-[12px] text-text-2">Reconciliation</p>
          <p className={overview.openMismatches ? "mt-1 text-[19px] font-semibold tabular text-warn" : "mt-1 text-[19px] font-semibold tabular"}>{overview.openMismatches ? `${overview.openMismatches} open` : "No findings"}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-text-3">
            {overview.counts.linked} prices linked · {overview.counts.contacts} contacts
          </p>
        </a>
      </div>
    </Card>
  );
}

// ─── Needs attention ─────────────────────────────────────────────────────────

type EventRow = { id: string; category: string; eventType: string; status: string; direction: string; lastError: string | null; attempts: number; createdAt: string; externalId: string | null };

export function GhlProblems({ events }: { events: EventRow[] }) {
  const retryAll = useAction(retryGhlEventsAction, { success: (r) => `${r.retried} event(s) queued again` });
  return (
    <Card>
      <CardHeader
        title="Needs attention"
        subtitle="Failed after retries, or waiting for a decision. Fix the cause (mapping, scopes, duplicates), then retry."
        actions={events.length ? <Button size="sm" loading={retryAll.pending} onClick={() => retryAll.run("all_failed")}><RotateCcw /> Retry all</Button> : null}
      />
      <EventTable events={events} empty="Nothing needs attention." />
    </Card>
  );
}

export function EventTable({ events, empty }: { events: EventRow[]; empty: string }) {
  const retry = useAction(retryGhlEventsAction, { success: "Queued again" });
  const dismiss = useAction(dismissGhlEventsAction, { success: "Dismissed" });
  return (
    <TableWrap>
      <Table>
        <THead>
          <TH>Event</TH>
          <TH>Area</TH>
          <TH>Status</TH>
          <TH>Detail</TH>
          <TH>When</TH>
          <TH align="right">{""}</TH>
        </THead>
        <tbody>
          {events.length === 0 ? <EmptyRow colSpan={6}>{empty}</EmptyRow> : null}
          {events.map((e) => (
            <TR key={e.id}>
              <TD className="font-medium">
                {e.direction === "inbound" ? "← " : "→ "}
                {e.eventType}
                {e.attempts > 1 ? <span className="ml-1 text-[11.5px] font-normal text-text-3">×{e.attempts}</span> : null}
              </TD>
              <TD className="text-text-2">{CATEGORY_LABELS[e.category] ?? e.category}</TD>
              <TD>
                <SyncStatusPill status={e.status} />
              </TD>
              <TD className="max-w-[420px] text-[12.5px] text-text-2">
                <span className="line-clamp-2">{e.lastError ?? (e.externalId ? `GHL ${e.externalId}` : "—")}</span>
              </TD>
              <TD className="whitespace-nowrap text-[12.5px] text-text-3">{new Date(e.createdAt).toLocaleString()}</TD>
              <TD align="right">
                {["failed", "needs_review", "retry_scheduled"].includes(e.status) ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" loading={retry.pending} onClick={() => retry.run([e.id])}>Retry</Button>
                    {e.status !== "retry_scheduled" ? (
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost">Dismiss</Button>}
                        title="Dismiss this event?"
                        description="Use this when the issue was handled another way. It stays in the log."
                        tone="primary"
                        requireReason
                        reasonLabel="Note"
                        confirmLabel="Dismiss"
                        onConfirm={async (note) => (await dismiss.run([e.id], note)).ok}
                      />
                    ) : null}
                  </div>
                ) : null}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

// ─── Reconciliation findings ─────────────────────────────────────────────────

type MismatchRow = { id: string; kind: string; message: string; detectedAt: string; lastSeenAt: string };

const KIND_LABELS: Record<string, string> = {
  inventory: "Stock differs",
  oversold_online: "Oversold online",
  online_refund_restock: "Online refund",
  order_unmapped_items: "Unlinked order items",
  order_total: "Order total differs",
  duplicate_customer: "Duplicate customers",
  duplicate_lead: "Duplicate leads",
  stale_external: "Missing in GHL",
};

export function GhlMismatches({ rows }: { rows: MismatchRow[] }) {
  const act = useAction(resolveMismatchAction);
  return (
    <Card>
      <span id="findings" />
      <CardHeader title="Reconciliation findings" subtitle="Differences found by reconciliation or imports. The dashboard never changes stock or money by itself — choose what to do." />
      <TableWrap>
        <Table>
          <THead>
            <TH>Finding</TH>
            <TH>Detail</TH>
            <TH>Last seen</TH>
            <TH align="right">{""}</TH>
          </THead>
          <tbody>
            {rows.length === 0 ? <EmptyRow colSpan={4}>No open findings.</EmptyRow> : null}
            {rows.map((m) => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap font-medium">{KIND_LABELS[m.kind] ?? m.kind}</TD>
                <TD className="max-w-[520px] text-[12.5px] text-text-2">{m.message}</TD>
                <TD className="whitespace-nowrap text-[12.5px] text-text-3">{new Date(m.lastSeenAt).toLocaleString()}</TD>
                <TD align="right">
                  <div className="flex justify-end gap-1">
                    {m.kind === "inventory" ? (
                      <Button size="sm" variant="ghost" loading={act.pending} onClick={() => act.run(m.id, "push_local")}>Push dashboard stock</Button>
                    ) : (
                      <Button size="sm" variant="ghost" loading={act.pending} onClick={() => act.run(m.id, "resolved")}>Mark resolved</Button>
                    )}
                    <Button size="sm" variant="ghost" loading={act.pending} onClick={() => act.run(m.id, "ignore")}>Dismiss</Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

// ─── Settings & mapping ──────────────────────────────────────────────────────

export function GhlSettingsForm({ overview }: { overview: GhlOverview }) {
  const [s, setS] = useState(overview.settings);
  const save = useAction(saveGhlSettingsAction);
  const queue = useAction(queueGhlSyncAction, { success: (r) => `${r.queued} item(s) queued` });
  const pipeline = overview.mapping.pipelines.find((p) => p.id === s.salesPipelineId);
  const stageOptions = (
    <>
      <option value="">Keep current stage</option>
      {pipeline?.stages.map((st) => (
        <option key={st.id} value={st.id}>{st.name}</option>
      ))}
    </>
  );
  const toggles: [keyof typeof s.sync, string, string][] = [
    ["contacts", "Contacts & leads", "Leads/customers ↔ GHL contacts; stage tags; GHL form contacts become leads."],
    ["opportunities", "Opportunities", "Mirror GHL pipeline opportunities in the dashboard."],
    ["appointments", "Appointments", "Mirror GHL calendar bookings; push dashboard bookings when GHL is authoritative."],
    ["sales", "POS sales → CRM", "Each POS sale/order becomes one opportunity with a contact note."],
    ["products", "Products", "Publish products and prices to GHL (dashboard is the source of truth)."],
    ["inventory", "Inventory", "Publish available stock for published products."],
    ["orders", "Online orders", "Import paid GHL store orders as sales and deduct stock once."],
  ];
  return (
    <Card>
      <CardHeader title="Sync settings" subtitle="Switch areas on when their mapping is ready. Changes apply to new events." />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {toggles.map(([key, label, description]) => (
            <Checkbox key={key} label={label} description={description} checked={s.sync[key]} onChange={(e) => setS({ ...s, sync: { ...s.sync, [key]: e.target.checked } })} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Appointments system of record" value={s.appointmentsAuthority} onChange={(e) => setS({ ...s, appointmentsAuthority: e.target.value as "platform" | "ghl" })} hint="With GoHighLevel, dashboard bookings are confirmed by GHL before they count as synced.">
            <option value="platform">This dashboard</option>
            <option value="ghl">GoHighLevel calendars</option>
          </SelectField>
          <SelectField label="Sales pipeline" value={s.salesPipelineId ?? ""} onChange={(e) => setS({ ...s, salesPipelineId: e.target.value || null })} hint={overview.mapping.pipelines.length ? undefined : "Refresh GHL data to load pipelines."}>
            <option value="">Choose…</option>
            {overview.mapping.pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </SelectField>
          <SelectField label="Stage: POS sale completed" value={s.stageMap.posCompleted ?? ""} onChange={(e) => setS({ ...s, stageMap: { ...s.stageMap, posCompleted: e.target.value || null } })}>{stageOptions}</SelectField>
          <SelectField label="Stage: order placed" value={s.stageMap.orderOpen ?? ""} onChange={(e) => setS({ ...s, stageMap: { ...s.stageMap, orderOpen: e.target.value || null } })}>{stageOptions}</SelectField>
          <SelectField label="Stage: order ready for pickup" value={s.stageMap.orderReady ?? ""} onChange={(e) => setS({ ...s, stageMap: { ...s.stageMap, orderReady: e.target.value || null } })}>{stageOptions}</SelectField>
          <SelectField label="Stage: order handed over" value={s.stageMap.orderCompleted ?? ""} onChange={(e) => setS({ ...s, stageMap: { ...s.stageMap, orderCompleted: e.target.value || null } })}>{stageOptions}</SelectField>
          <SelectField label="Stockroom published to GHL" value={s.inventoryLocationId ?? ""} onChange={(e) => setS({ ...s, inventoryLocationId: e.target.value || null })} hint="GHL keeps one quantity per price, so one stockroom is published.">
            <option value="">First branch</option>
            {overview.mapping.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </SelectField>
          <SelectField label="Branch for online orders" value={s.onlineBranchId ?? ""} onChange={(e) => setS({ ...s, onlineBranchId: e.target.value || null })} hint="Imported GHL orders are recorded at this branch and deduct its stock.">
            <option value="">First branch</option>
            {overview.mapping.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </SelectField>
          <TextField label="Tag prefix" value={s.tagPrefix} onChange={(e) => setS({ ...s, tagPrefix: e.target.value })} hint={`Lead stage tags look like “${s.tagPrefix}-stage-qualified”.`} />
          <TextField label="Order-ready trigger tag" value={s.orderReadyTag} onChange={(e) => setS({ ...s, orderReadyTag: e.target.value })} hint="Added when an order is ready (customers with SMS consent); trigger a GHL SMS workflow from it." />
        </div>
        <Checkbox label="Push lead stage tags" checked={s.stageTags} onChange={(e) => setS({ ...s, stageTags: e.target.checked })} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={save.pending} onClick={() => save.run(s)}>Save sync settings</Button>
          <Button loading={queue.pending} onClick={() => queue.run("metadata")}><RefreshCw /> Refresh GHL data</Button>
          <Button loading={queue.pending} onClick={() => queue.run("products")} disabled={!overview.settings.sync.products}>Publish all products</Button>
          <Button loading={queue.pending} onClick={() => queue.run("inventory")} disabled={!overview.settings.sync.inventory}>Push all stock</Button>
          <Button loading={queue.pending} onClick={() => queue.run("customers")} disabled={!overview.settings.sync.contacts}>Sync all customers</Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function GhlCalendarMapping({ overview }: { overview: GhlOverview }) {
  const act = useAction(mapGhlCalendarAction);
  const { calendars, branches, appointmentTypes } = overview.mapping;
  return (
    <Card>
      <CardHeader title="Calendars" subtitle="Map each GHL calendar to the branch and appointment type it books. Unmapped calendars' bookings are held for review." />
      <TableWrap>
        <Table>
          <THead>
            <TH>GHL calendar</TH>
            <TH>Branch</TH>
            <TH>Appointment type</TH>
          </THead>
          <tbody>
            {calendars.length === 0 ? <EmptyRow colSpan={3}>No calendars loaded yet — use “Refresh GHL data”.</EmptyRow> : null}
            {calendars.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">
                  {c.name}
                  {!c.isActive ? <span className="ml-2 text-[11.5px] text-text-3">inactive</span> : null}
                </TD>
                <TD>
                  <Select aria-label={`Branch for ${c.name}`} value={c.branchId ?? ""} onChange={(e) => act.run(c.id, e.target.value || null, c.appointmentTypeId)} className="h-8 text-[12.5px]">
                    <option value="">Not mapped</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <Select aria-label={`Appointment type for ${c.name}`} value={c.appointmentTypeId ?? ""} onChange={(e) => act.run(c.id, c.branchId, e.target.value || null)} className="h-8 text-[12.5px]">
                    <option value="">Not mapped</option>
                    {appointmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

export function GhlUserMapping({ overview }: { overview: GhlOverview }) {
  const act = useAction(mapGhlUserAction);
  return (
    <Card>
      <CardHeader title="Users" subtitle="Links GHL users to staff so assigned appointments land on the right practitioner. Matched by email automatically when possible." />
      <TableWrap>
        <Table>
          <THead>
            <TH>GHL user</TH>
            <TH>Staff member</TH>
          </THead>
          <tbody>
            {overview.mapping.users.length === 0 ? <EmptyRow colSpan={2}>No users loaded yet — use “Refresh GHL data”.</EmptyRow> : null}
            {overview.mapping.users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <span className="font-medium">{u.name}</span>
                  {u.email ? <span className="block text-[11.5px] text-text-3">{u.email}</span> : null}
                </TD>
                <TD>
                  <Select aria-label={`Staff member for ${u.name}`} value={u.membershipId ?? ""} onChange={(e) => act.run(u.id, e.target.value || null)} className="h-8 text-[12.5px]">
                    <option value="">Not linked</option>
                    {overview.mapping.staff.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

export function GhlEndpoints({ overview }: { overview: GhlOverview }) {
  return (
    <Card>
      <CardHeader title="Endpoints" subtitle="Values to enter in GoHighLevel. Webhook deliveries are verified and deduplicated; secrets are only shown here." />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">Marketplace app (all businesses)</p>
          <CopyRow label="OAuth redirect URL" value={overview.redirectUri} />
          <CopyRow label="Webhook URL" value={overview.marketplaceWebhookUrl} />
          <p className="text-[12px] text-text-3">Subscribe to: ContactCreate, ContactUpdate, ContactDelete, ContactTagUpdate, Opportunity* (Create, Update, StageUpdate, StatusUpdate, MonetaryValueUpdate, AssignedToUpdate, Delete), AppointmentCreate/Update/Delete, OrderCreate, OrderStatusUpdate, AppUninstall.</p>
        </div>
        {overview.workflowWebhookSecret ? (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-[13px] font-semibold">Workflow webhook (this business, optional)</p>
            <p className="text-[12px] text-text-3">For a GHL workflow “Webhook” action (e.g. after a form submission). Send the contact id, name, email and phone with this header.</p>
            <CopyRow label="URL" value={overview.workflowWebhookUrl} />
            <CopyRow label="x-webhook-secret" value={overview.workflowWebhookSecret} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
