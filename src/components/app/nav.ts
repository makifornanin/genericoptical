import type { Permission } from "@/lib/permissions";

export type NavIcon =
  | "dashboard"
  | "analytics"
  | "pos"
  | "sales"
  | "orders"
  | "payments"
  | "leads"
  | "pipeline"
  | "customers"
  | "appointments"
  | "products"
  | "stock"
  | "purchasing"
  | "suppliers"
  | "expenses"
  | "reports"
  | "staff"
  | "activity"
  | "settings";

export type NavItem = { href: string; label: string; icon: NavIcon; permission: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/app", label: "Dashboard", icon: "dashboard", permission: "dashboard.view" },
      { href: "/app/analytics", label: "Analytics", icon: "analytics", permission: "analytics.view" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/app/pos", label: "Point of sale", icon: "pos", permission: "pos.use" },
      { href: "/app/sales", label: "Transactions", icon: "sales", permission: "sales.view" },
      { href: "/app/orders", label: "Orders", icon: "orders", permission: "orders.view" },
      { href: "/app/payments", label: "Payments", icon: "payments", permission: "sales.view" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/app/leads", label: "Leads", icon: "leads", permission: "leads.view" },
      { href: "/app/pipeline", label: "CRM pipeline", icon: "pipeline", permission: "leads.view" },
      { href: "/app/customers", label: "Customers", icon: "customers", permission: "customers.view" },
      { href: "/app/appointments", label: "Appointments", icon: "appointments", permission: "appointments.view" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/app/products", label: "Products", icon: "products", permission: "products.view" },
      { href: "/app/inventory", label: "Stock", icon: "stock", permission: "inventory.view" },
      { href: "/app/purchase-orders", label: "Purchase orders", icon: "purchasing", permission: "purchasing.view" },
      { href: "/app/suppliers", label: "Suppliers", icon: "suppliers", permission: "suppliers.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/app/expenses", label: "Expenses", icon: "expenses", permission: "expenses.view" },
      { href: "/app/reports", label: "Reports", icon: "reports", permission: "analytics.view" },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/app/staff", label: "Staff", icon: "staff", permission: "staff.view" },
      { href: "/app/activity", label: "Activity log", icon: "activity", permission: "audit.view" },
      { href: "/app/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
    ],
  },
];
