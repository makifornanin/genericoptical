"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

/** The POS runs as its own full-screen workspace: no sidebar, no dashboard chrome. */
export function isPosPath(pathname: string | null) {
  return pathname === "/app/pos" || Boolean(pathname?.startsWith("/app/pos/"));
}

/**
 * The dashboard frame (sidebar + rounded canvas). On the POS route it steps aside so the register can
 * use the whole window; the POS draws its own compact header with an Exit button.
 */
export function AppFrame({ nav, banner, style, children }: { nav: ReactNode; banner: ReactNode; style: CSSProperties; children: ReactNode }) {
  const pathname = usePathname();
  if (isPosPath(pathname)) {
    return (
      <div className="min-h-dvh bg-canvas" style={style}>
        <main id="main" className="flex min-h-dvh flex-col">
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-ink lg:flex" style={style}>
      {nav}
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <main id="main" className="relative flex min-h-[calc(100vh-56px)] flex-1 flex-col bg-canvas lg:min-h-0 lg:rounded-[20px]">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
