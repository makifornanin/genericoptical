import type { Role } from "@/lib/permissions";

export const DEMO_DOMAIN = "lensmere.example";
export const DEMO_PASSWORD = "Lensmere-demo-2026";
export const DEMO_SLUG = "lensmere-optical";

export type StaffSpec = { email: string; name: string; role: Role; title: string; branch: string; takes?: boolean; color?: string };

export const DEMO_ACCOUNTS: StaffSpec[] = [
  { email: `owner@${DEMO_DOMAIN}`, name: "Alex Mercado", role: "owner", title: "Owner", branch: "MKT" },
  { email: `manager@${DEMO_DOMAIN}`, name: "Bea Santos", role: "manager", title: "Operations manager", branch: "MKT" },
  { email: `sales@${DEMO_DOMAIN}`, name: "Carlo Reyes", role: "sales", title: "Optical sales associate", branch: "QC" },
  { email: `inventory@${DEMO_DOMAIN}`, name: "Dana Cruz", role: "inventory", title: "Inventory lead", branch: "MKT" },
  { email: `optometrist@${DEMO_DOMAIN}`, name: "Dr. Elise Navarro", role: "practitioner", title: "Optometrist", branch: "MKT", takes: true, color: "#4F6B3A" },
];
