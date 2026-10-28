import { Pencil, Plus } from "lucide-react";
import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { ghlOverview, listMismatches, listSyncEvents } from "@/server/integrations/ghl";
import { appointmentTypes } from "@/server/db/schema";
import { asc, eq } from "drizzle-orm";
import { can } from "@/server/services/core";
import { listSiteKeys } from "@/server/services/public-api";
import { listBranches } from "@/server/services/settings";
import { env } from "@/server/env";
import { Pagination } from "@/components/ui/table";
import { AppointmentTypeDialog, BranchDialog, DemoPanel, HoursForm, ProfileForm, TaxForm, WebsiteForm } from "./forms";
import { CatalogueFeedCard } from "./catalogue-feed";
import { WebsiteOrdersCard } from "./website-orders";
import { SiteKeysCard } from "./site-keys";
import { EventTable, GhlAccessCheck, GhlCalendarMapping, GhlConnectionCard, GhlEndpoints, GhlMismatches, GhlOpticalPipelines, GhlProblems, GhlSettingsForm, GhlSyncStatus, GhlUserMapping } from "./ghl-panel";

const PATH = "/app/settings";

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "settings.manage")) return <Forbidden what="settings" />;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "business";
  const b = session.business;
  const f = formatter(b);
  const demo = process.env.DEMO_MODE === "true" && b.isDemo && can(ctx, "demo.reset") && (!process.env.VERCEL || process.env.ALLOW_DEMO_RESET === "true");

  let body: React.ReactNode = null;
  if (tab === "business") {
    body = (
      <ProfileForm
        initial={{
          name: b.name,
          legalName: b.legalName ?? "",
          tagline: b.tagline ?? "",
          description: b.description ?? "",
          logoUrl: b.logoUrl ?? "",
          brandColor: b.brandColor,
          accentColor: b.accentColor,
          email: b.email ?? "",
          phone: b.phone ?? "",
          website: b.website ?? "",
          addressLine1: b.addressLine1 ?? "",
          addressLine2: b.addressLine2 ?? "",
          city: b.city ?? "",
          region: b.region ?? "",
          postalCode: b.postalCode ?? "",
          country: b.country,
        }}
      />
    );
  } else if (tab === "tax") {
    body = (
      <TaxForm
        initial={{
          currency: b.currency,
          locale: b.locale,
          timezone: b.timezone,
          taxName: b.taxName,
          taxRatePct: String(b.taxRateBps / 100),
          pricesIncludeTax: b.pricesIncludeTax,
          taxRegistration: b.taxRegistration ?? "",
          receiptFooter: b.receiptFooter ?? "",
          maxDiscountPct: String((b.settings.maxStaffDiscountBps ?? 2000) / 100),
        }}
      />
    );
  } else if (tab === "hours") {
    body = <HoursForm initial={b.businessHours} />;
  } else if (tab === "branches") {
    const rows = await listBranches(b.id);
    const blank = { name: "", code: "", addressLine1: "", addressLine2: "", city: "", region: "", phone: "", email: "", mapUrl: "", imageUrl: "", businessHours: null, isActive: true };
    body = (
      <Card>
        <CardHeader title="Branches" subtitle="Each branch has its own stockroom, calendar and sales." actions={<BranchDialog initial={blank} defaultHours={b.businessHours} trigger={<Button variant="primary" size="sm"><Plus /> Add branch</Button>} />} />
        <TableWrap>
          <Table>
            <THead>
              <TH>Branch</TH>
              <TH>Address</TH>
              <TH>Phone</TH>
              <TH>Hours</TH>
              <TH>Status</TH>
              <TH align="right">{""}</TH>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    {r.name} <span className="text-text-3">· {r.code}</span>
                  </TD>
                  <TD className="text-text-2">{[r.addressLine1, r.city].filter(Boolean).join(", ") || "—"}</TD>
                  <TD className="text-text-2">{r.phone ?? "—"}</TD>
                  <TD className="text-text-2">{r.businessHours ? "Custom" : "Business default"}</TD>
                  <TD>{r.isActive ? <Pill tone="positive" dot>Active</Pill> : <Pill>Inactive</Pill>}</TD>
                  <TD align="right">
                    <BranchDialog
                      id={r.id}
                      defaultHours={b.businessHours}
                      initial={{ name: r.name, code: r.code, addressLine1: r.addressLine1 ?? "", addressLine2: r.addressLine2 ?? "", city: r.city ?? "", region: r.region ?? "", phone: r.phone ?? "", email: r.email ?? "", mapUrl: r.mapUrl ?? "", imageUrl: r.imageUrl ?? "", businessHours: r.businessHours, isActive: r.isActive }}
                      trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`}><Pencil /></Button>}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    );
  } else if (tab === "appointments") {
    const all = await getDb().select().from(appointmentTypes).where(eq(appointmentTypes.businessId, b.id)).orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name));
    const blank = { name: "", code: "", description: "", durationMinutes: "30", requiresPractitioner: true, isPublic: true, priceCents: null, isActive: true };
    body = (
      <Card>
        <CardHeader title="Appointment types" subtitle="Durations drive the calendar and online booking slots." actions={<AppointmentTypeDialog initial={blank} trigger={<Button variant="primary" size="sm"><Plus /> Add type</Button>} />} />
        <TableWrap>
          <Table>
            <THead>
              <TH>Type</TH>
              <TH align="right">Duration</TH>
              <TH>Practitioner</TH>
              <TH>Online</TH>
              <TH align="right">Price</TH>
              <TH>Status</TH>
              <TH align="right">{""}</TH>
            </THead>
            <tbody>
              {all.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">
                    {t.name}
                    <div className="font-mono text-[11px] font-normal text-text-3">{t.code}</div>
                  </TD>
                  <TD align="right">{t.durationMinutes} min</TD>
                  <TD className="text-text-2">{t.requiresPractitioner ? "Required" : "Not needed"}</TD>
                  <TD className="text-text-2">{t.isPublic ? "Bookable" : "Staff only"}</TD>
                  <TD align="right">{t.priceCents !== null ? f.money(t.priceCents) : "—"}</TD>
                  <TD>{t.isActive ? <Pill tone="positive" dot>Active</Pill> : <Pill>Inactive</Pill>}</TD>
                  <TD align="right">
                    <AppointmentTypeDialog
                      id={t.id}
                      initial={{ name: t.name, code: t.code, description: t.description ?? "", durationMinutes: String(t.durationMinutes), requiresPractitioner: t.requiresPractitioner, isPublic: t.isPublic, priceCents: t.priceCents, isActive: t.isActive }}
                      trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`}><Pencil /></Button>}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    );
  } else if (tab === "website") {
    const w = b.websiteContent;
    const keys = can(ctx, "integrations.manage") ? await listSiteKeys(ctx) : null;
    body = (
      <div className="flex flex-col gap-4">
        <WebsiteForm
          initial={{
            heroEyebrow: w.heroEyebrow ?? "",
            heroTitle: w.heroTitle ?? "",
            heroBody: w.heroBody ?? "",
            aboutTitle: w.aboutTitle ?? "",
            aboutBody: w.aboutBody ?? "",
            privacyContactEmail: w.privacyContactEmail ?? "",
            values: w.values ?? [],
            faqs: w.faqs ?? [],
          }}
        />
        {can(ctx, "settings.manage") ? <WebsiteOrdersCard initial={{ enabled: b.settings.websiteOrders?.enabled ?? b.isDemo }} isDemo={b.isDemo} /> : null}
        {keys ? (
          <CatalogueFeedCard
            initial={{ enabled: b.settings.catalogueFeed?.enabled ?? false, origins: b.settings.catalogueFeed?.origins ?? [] }}
            baseUrl={`${new URL(env().APP_URL).origin}/api/public/v1/feed/${b.slug}`}
          />
        ) : null}
        {keys ? (
          <SiteKeysCard
            apiUrl={new URL(env().APP_URL).origin}
            keys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))}
          />
        ) : null}
      </div>
    );
  } else if (tab === "integrations") {
    if (!can(ctx, "integrations.manage")) body = <p className="text-[13.5px] text-text-2">You don&apos;t have permission to manage integrations.</p>;
    else {
      const view = typeof sp.ghl === "string" ? sp.ghl : "overview";
      const overview = await ghlOverview(ctx);
      const flash = sp.ghl === "connected" ? { kind: "connected" as const, message: `Connected to ${typeof sp.account === "string" ? sp.account : "GoHighLevel"}.` } : sp.ghl === "error" ? { kind: "error" as const, message: typeof sp.message === "string" ? sp.message : "Connecting GoHighLevel failed." } : null;
      const toRow = (e: Awaited<ReturnType<typeof listSyncEvents>>["rows"][number]) => ({ id: e.id, category: e.category, eventType: e.eventType, status: e.status, direction: e.direction, lastError: e.lastError, attempts: e.attempts, createdAt: e.createdAt.toISOString(), externalId: e.externalId });
      let section: React.ReactNode;
      if (view === "mapping") {
        section = (
          <>
            <GhlOpticalPipelines overview={overview} />
            <GhlSettingsForm overview={overview} />
            <GhlCalendarMapping overview={overview} />
            <GhlUserMapping overview={overview} />
          </>
        );
      } else if (view === "log") {
        const page = await listSyncEvents(ctx, { status: typeof sp.status === "string" ? sp.status : null, category: typeof sp.category === "string" ? sp.category : null, page: Number(sp.page ?? 1) || 1 });
        section = (
          <Card>
            <CardHeader title="Sync log" subtitle={`${page.total} event(s)${typeof sp.category === "string" ? ` · ${sp.category}` : ""}${typeof sp.status === "string" ? ` · ${sp.status}` : ""}`} />
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              <Segmented pathname={PATH} params={sp} param="status" options={[{ value: "", label: "All" }, { value: "problems", label: "Needs attention" }, { value: "pending", label: "Queued" }, { value: "synced", label: "Synced" }, { value: "skipped", label: "Skipped" }]} />
            </div>
            <EventTable events={page.rows.map(toRow)} empty="No events." />
            <Pagination pathname={PATH} params={sp} page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
          </Card>
        );
      } else if (view === "endpoints") {
        section = <GhlEndpoints overview={overview} />;
      } else {
        const problems = await listSyncEvents(ctx, { status: "problems", page: 1 });
        const mismatches = await listMismatches(ctx, "open");
        section = (
          <>
            <GhlConnectionCard overview={overview} flash={flash} />
            {overview.connection && overview.connection.status !== "disabled" && overview.connection.status !== "not_configured" ? (
              <>
                <GhlAccessCheck />
                <GhlSyncStatus overview={overview} />
                <GhlProblems events={problems.rows.map(toRow)} />
                <GhlMismatches rows={mismatches.map((m) => ({ id: m.id, kind: m.kind, message: m.message, detectedAt: m.detectedAt.toISOString(), lastSeenAt: m.lastSeenAt.toISOString() }))} />
              </>
            ) : null}
          </>
        );
      }
      body = (
        <div className="flex flex-col gap-4">
          <Segmented
            pathname={PATH}
            params={{ tab: "integrations", ghl: view }}
            param="ghl"
            options={[
              { value: "overview", label: "Overview" },
              { value: "mapping", label: "Sync settings & mapping" },
              { value: "log", label: "Sync log" },
              { value: "endpoints", label: "Endpoints" },
            ]}
          />
          {section}
        </div>
      );
    }
  } else if (tab === "demo" && demo) {
    body = <DemoPanel />;
  }

  return (
    <PageBody>
      <Segmented
        pathname={PATH}
        params={sp}
        param="tab"
        options={[
          { value: "business", label: "Business & branding" },
          { value: "tax", label: "Currency & tax" },
          { value: "hours", label: "Hours" },
          { value: "branches", label: "Branches" },
          { value: "appointments", label: "Appointment types" },
          { value: "website", label: "Website" },
          { value: "integrations", label: "Integrations" },
          ...(demo ? [{ value: "demo", label: "Demo data" }] : []),
        ]}
      />
      {body}
    </PageBody>
  );
}

export default function SettingsPage(props: PageProps<"/app/settings">) {
  return (
    <>
      <PageHeader title="Settings" subtitle="Customise the business without changing code: branding, tax, hours, branches, website and integrations." />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
