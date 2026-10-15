import type { Metadata } from "next";
import { Suspense } from "react";
import { ShellNav } from "@/components/app/shell-client";
import { NAV } from "@/components/app/nav";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { brandVars } from "@/lib/color";
import { requireSession } from "@/server/auth/session";
import { signOutAction } from "./shell-actions";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false } };

async function Shell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => session.ctx.permissions.has(i.permission)) })).filter((g) => g.items.length);
  const demo = process.env.DEMO_MODE === "true" && session.business.isDemo;
  return (
    <div className="min-h-screen bg-ink lg:flex" style={brandVars(session.business.brandColor, session.business.accentColor) as React.CSSProperties}>
      <ShellNav
        groups={groups}
        business={{ name: session.business.name, tagline: session.business.tagline, logoUrl: session.business.logoUrl }}
        user={{ name: session.user.name, email: session.user.email, roleLabel: ROLE_LABELS[session.membership.role as Role] }}
        signOut={signOutAction}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <main id="main" className="relative flex min-h-[calc(100vh-56px)] flex-1 flex-col bg-canvas lg:min-h-0 lg:rounded-[20px]">
          {demo ? (
            <div className="flex items-center justify-center gap-2 border-b border-line bg-accent-soft px-4 py-1.5 text-center text-[12px] text-ink lg:rounded-t-[20px]">
              <span className="font-semibold">Demo environment</span>
              <span className="text-text-2">· Fictional business and sample records. Changes you make are saved and visible across modules.</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="min-h-screen bg-ink lg:flex">
      <aside className="hidden w-[248px] shrink-0 lg:block" />
      <div className="flex-1 lg:py-2 lg:pr-2">
        <div className="min-h-screen bg-canvas lg:min-h-[calc(100vh-16px)] lg:rounded-[20px]" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
