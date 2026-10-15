import type { PermissionOverrides } from "./types";

export const ROLES = ["owner", "manager", "sales", "inventory", "practitioner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  sales: "Sales staff",
  inventory: "Inventory staff",
  practitioner: "Practitioner",
};

/** Every permission the server checks. UI visibility derives from the same list. */
export const PERMISSIONS = {
  "dashboard.view": "View the dashboard",
  "analytics.view": "View financial analytics and reports",
  "pos.use": "Use the point of sale",
  "sales.view": "View sales and transactions",
  "sales.discount.unlimited": "Apply discounts above the staff limit",
  "sales.refund": "Process refunds",
  "sales.cancel": "Cancel unpaid sales and orders",
  "payments.record": "Record payments",
  "payments.void": "Void payments",
  "orders.view": "View customer orders",
  "orders.manage": "Create and update customer orders",
  "customers.view": "View customers",
  "customers.manage": "Create and edit customers",
  "prescriptions.view": "View prescription records",
  "prescriptions.manage": "Create and edit prescription records",
  "leads.view": "View assigned leads",
  "leads.view_all": "View all leads",
  "leads.manage": "Create and edit leads",
  "leads.assign": "Assign leads to staff",
  "appointments.view": "View own appointments",
  "appointments.view_all": "View all appointments",
  "appointments.manage": "Create and change appointments",
  "products.view": "View products",
  "products.manage": "Create and edit products",
  "products.costs": "See cost prices and margins",
  "inventory.view": "View stock levels",
  "inventory.adjust": "Adjust stock and record damage",
  "inventory.receive": "Receive stock",
  "inventory.transfer": "Transfer stock between branches",
  "purchasing.view": "View purchase orders",
  "purchasing.manage": "Create purchase orders",
  "purchasing.approve": "Confirm purchase orders with suppliers",
  "suppliers.view": "View suppliers",
  "suppliers.manage": "Create and edit suppliers",
  "expenses.view": "View expenses",
  "expenses.manage": "Record and edit expenses",
  "staff.view": "View staff",
  "staff.manage": "Invite and manage staff",
  "audit.view": "View activity logs",
  "settings.manage": "Change business settings",
  "integrations.manage": "Manage integrations",
  "demo.reset": "Reset demo data",
} as const;

export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

const MANAGER_EXCLUDED: Permission[] = ["staff.manage", "settings.manage", "integrations.manage", "demo.reset"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => !MANAGER_EXCLUDED.includes(p)),
  sales: [
    "dashboard.view",
    "pos.use",
    "sales.view",
    "payments.record",
    "orders.view",
    "orders.manage",
    "customers.view",
    "customers.manage",
    "leads.view",
    "leads.manage",
    "appointments.view",
    "appointments.view_all",
    "appointments.manage",
    "products.view",
    "inventory.view",
  ],
  inventory: [
    "dashboard.view",
    "products.view",
    "products.manage",
    "products.costs",
    "inventory.view",
    "inventory.adjust",
    "inventory.receive",
    "inventory.transfer",
    "purchasing.view",
    "purchasing.manage",
    "suppliers.view",
    "suppliers.manage",
    "orders.view",
  ],
  practitioner: [
    "dashboard.view",
    "appointments.view",
    "appointments.manage",
    "customers.view",
    "prescriptions.view",
    "prescriptions.manage",
    "orders.view",
    "products.view",
  ],
};

/** Permissions that may be granted/revoked per member (owners always keep everything). */
export function resolvePermissions(role: Role, overrides: PermissionOverrides | null | undefined): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (role === "owner") return set;
  for (const p of overrides?.grant ?? []) if (p in PERMISSIONS && !["demo.reset"].includes(p)) set.add(p as Permission);
  for (const p of overrides?.revoke ?? []) set.delete(p as Permission);
  return set;
}
