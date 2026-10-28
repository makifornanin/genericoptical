import { Suspense } from "react";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listStaff } from "@/server/services/staff";
import { EditStaffButton, StaffFormDialog, TempPasswordButton } from "./staff-form";

async function Content() {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "staff.view")) return <Forbidden what="staff" />;
  const f = formatter(session.business);
  const [rows, { branches }] = await Promise.all([listStaff(ctx), getBranchContext(session.business.id)]);
  const manage = can(ctx, "staff.manage");
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));
  return (
    <PageBody>
      <Toolbar
        actions={
          manage ? (
            <StaffFormDialog
              branches={branchOptions}
              canMakeOwner={ctx.role === "owner"}
              initial={{ name: "", email: "", role: "sales", title: "", phone: "", defaultBranchId: "", takesAppointments: false, calendarColor: "", grant: [], revoke: [], isActive: true }}
            />
          ) : null
        }
      >
        <p className="text-[13px] text-text-2">
          {rows.filter((r) => r.membership.isActive).length} active · {rows.filter((r) => !r.membership.isActive).length} inactive
        </p>
      </Toolbar>
      <Card>
        <TableWrap>
          <Table>
            <THead>
              <TH>Staff member</TH>
              <TH>Role</TH>
              <TH>Branch</TH>
              <TH align="right">Sales (30 days)</TH>
              <TH>Last sign-in</TH>
              <TH>Status</TH>
              {manage ? <TH align="right">{""}</TH> : null}
            </THead>
            <tbody>
              {rows.map((r) => {
                const m = r.membership;
                const overrides = (m.permissionOverrides.grant?.length ?? 0) + (m.permissionOverrides.revoke?.length ?? 0);
                return (
                  <TR key={m.id} className={!m.isActive ? "opacity-60" : undefined}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} color={m.calendarColor ?? undefined} size={32} />
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-[11.5px] text-text-3">
                            {r.email}
                            {m.title ? ` · ${m.title}` : ""}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Pill tone={m.role === "owner" ? "ink" : "neutral"}>{ROLE_LABELS[m.role as Role]}</Pill>
                      {overrides ? <span className="ml-1.5 text-[11.5px] text-info">{overrides} custom</span> : null}
                      {m.takesAppointments ? <div className="mt-0.5 text-[11.5px] text-text-3">Takes appointments</div> : null}
                    </TD>
                    <TD className="text-text-2">{r.branchName ?? "—"}</TD>
                    <TD align="right">
                      {r.salesCount ? (
                        <>
                          <span className="font-medium">{f.money(r.salesCents)}</span>
                          <div className="text-[11.5px] text-text-3">{r.salesCount} sales</div>
                        </>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </TD>
                    <TD className="text-text-2">{r.lastLoginAt ? f.relative(r.lastLoginAt) : "Never"}</TD>
                    <TD>{m.isActive ? <Pill tone="positive" dot>Active</Pill> : <Pill>Inactive</Pill>}</TD>
                    {manage ? (
                      <TD align="right">
                        {m.role !== "owner" || ctx.role === "owner" ? (
                          <div className="flex justify-end">
                            <EditStaffButton
                              id={m.id}
                              branches={branchOptions}
                              canMakeOwner={ctx.role === "owner"}
                              initial={{
                                name: r.name,
                                email: r.email,
                                role: m.role as Role,
                                title: m.title ?? "",
                                phone: m.phone ?? "",
                                defaultBranchId: m.defaultBranchId ?? "",
                                takesAppointments: m.takesAppointments,
                                calendarColor: m.calendarColor ?? "",
                                grant: m.permissionOverrides.grant ?? [],
                                revoke: m.permissionOverrides.revoke ?? [],
                                isActive: m.isActive,
                              }}
                            />
                            <TempPasswordButton id={m.id} name={r.name} />
                          </div>
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
      <p className="text-[12px] text-text-3">Permissions are enforced on the server for every action — hiding a menu item is never the only protection. Managers can be given extra permissions (or have defaults removed) per person.</p>
    </PageBody>
  );
}

export default function StaffPage() {
  return (
    <>
      <PageHeader title="Staff" subtitle="Team members, roles and access." />
      <Suspense fallback={<TableSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}
