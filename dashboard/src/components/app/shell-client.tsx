"use client";

import {
  Boxes,
  CalendarDays,
  ChartLine,
  ChevronDown,
  ClipboardList,
  FileChartColumn,
  Glasses,
  History,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  PackageCheck,
  Receipt,
  ReceiptText,
  ScanBarcode,
  Settings,
  SquareKanban,
  Store,
  Truck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { NavGroup, NavIcon } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutGrid,
  analytics: ChartLine,
  pos: ScanBarcode,
  sales: Receipt,
  orders: PackageCheck,
  payments: Wallet,
  leads: UserPlus,
  pipeline: SquareKanban,
  customers: Users,
  appointments: CalendarDays,
  products: Glasses,
  stock: Boxes,
  purchasing: ClipboardList,
  suppliers: Truck,
  expenses: ReceiptText,
  reports: FileChartColumn,
  staff: UserCog,
  activity: History,
  settings: Settings,
};

export type ShellUser = { name: string; email: string; roleLabel: string };
export type ShellBusiness = { name: string; tagline: string | null; logoUrl: string | null };

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 text-[10.5px] font-medium tracking-[0.08em] text-white/35 uppercase">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-[34px] items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] transition-colors",
                      active ? "bg-white/[0.09] font-medium text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full transition-colors",
                        active ? "bg-accent text-accent-ink" : "text-white/55 group-hover:text-white",
                      )}
                    >
                      <Icon className="size-[15px]" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ business }: { business: ShellBusiness }) {
  return (
    <Link href="/app" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-accent text-accent-ink">
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoUrl} alt="" className="size-5 object-contain" />
        ) : (
          <Glasses className="size-[18px]" strokeWidth={2} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-white">{business.name}</span>
        <span className="block truncate text-[11.5px] text-white/45">{business.tagline ?? "Operations"}</span>
      </span>
    </Link>
  );
}

function UserMenu({ user, signOut }: { user: ShellUser; signOut: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left hover:bg-white/[0.05] focus-visible:outline-white">
        <Avatar name={user.name} color="#4d7a2e" size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
          <span className="block truncate text-[11.5px] text-white/45">{user.roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-white/40" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start" className="w-[230px]">
        <MenuLabel>{user.email}</MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/app/account")}>
          <KeyRound /> Account &amp; password
        </MenuItem>
        <MenuItem onSelect={() => start(() => signOut())} disabled={pending}>
          <LogOut /> {pending ? "Signing out…" : "Sign out"}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function ShellNav({ groups, user, business, signOut }: { groups: NavGroup[]; user: ShellUser; business: ShellBusiness; signOut: () => Promise<void> }) {
  // The mobile menu stays open only for the page it was opened on, so navigating closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (o: boolean) => setOpenOn(o ? pathname : null);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-6 px-3 py-4 lg:flex">
        <Brand business={business} />
        <div className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
          <NavList groups={groups} />
        </div>
        <UserMenu user={user} signOut={signOut} />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Brand business={business} />
        <button type="button" className="flex size-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-5 bg-ink px-3 py-4">
            <div className="flex items-center justify-between">
              <Brand business={business} />
              <button type="button" className="flex size-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <UserMenu user={user} signOut={signOut} />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Global branch filter; stored in a cookie so it follows the user across pages. */
export function BranchSwitcher({ branches, selectedId, setBranch }: { branches: { id: string; name: string }[]; selectedId: string | null; setBranch: (id: string | null) => Promise<void> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (branches.length <= 1) return null;
  const current = branches.find((b) => b.id === selectedId);
  return (
    <Menu>
      <MenuTrigger
        className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-2"
        aria-label="Choose branch"
      >
        <Store className="size-4 text-text-3" aria-hidden="true" />
        {pending ? "Switching…" : current?.name ?? "All branches"}
        <ChevronDown className="size-3.5 text-text-3" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Branch</MenuLabel>
        {[{ id: null as string | null, name: "All branches" }, ...branches].map((b) => (
          <MenuItem
            key={b.id ?? "all"}
            onSelect={() =>
              start(async () => {
                await setBranch(b.id);
                router.refresh();
              })
            }
          >
            <span className={cn("size-1.5 rounded-full", b.id === selectedId ? "bg-ink" : "bg-transparent")} aria-hidden="true" />
            {b.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
