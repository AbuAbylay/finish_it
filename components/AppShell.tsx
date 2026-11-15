"use client";
// CONTRACT (agreed before the UI agents split; keep the props stable):
//   <AppShell me={me} title="Lessons">...</AppShell>                 app pages: sidebar + top bar (search, calendar)
//   <AppShell me={me} variant="flow" title="Short test">...</AppShell>  survey/test: top bar only, no sidebar nav
// `me` may be null while loading. The calendar button shows only when me.stage is "lesson" or "done".
// The calendar popover calls emitDayChange() after Skip/Reset; pages reload via useGate/onDayChange.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MeResponse } from "@/lib/api-types";
import { DemoDateBanner } from "./shell/DemoDateBanner";
import { DevBanner } from "./shell/DevBanner";
import { Drawer, SidebarContent, sidebarWidth, type SidebarPref } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";

export interface AppShellProps {
  me: MeResponse | null;
  title?: string;
  variant?: "app" | "flow";
  children: ReactNode;
}

const PREF_KEY = "fic_sidebar";

export function AppShell({ me, title, variant = "app", children }: AppShellProps) {
  const [pref, setPref] = useState<SidebarPref>(null);
  const [drawer, setDrawer] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const app = variant === "app";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved === "expanded" || saved === "collapsed") setPref(saved);
    } catch {
      // no storage: keep the width-based default
    }
  }, []);

  function toggle() {
    const current = pref ?? (window.matchMedia("(min-width: 1280px)").matches ? "expanded" : "collapsed");
    const next = current === "expanded" ? "collapsed" : "expanded";
    setPref(next);
    try {
      localStorage.setItem(PREF_KEY, next);
    } catch {
      // ignore
    }
  }

  const closeDrawer = useCallback(() => setDrawer(false), []);
  const { width, pad } = sidebarWidth(pref);

  return (
    <div className="min-h-dvh bg-canvas">
      {app && (
        <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-sidebar md:block ${width}`}>
          <SidebarContent loginId={me?.login_id ?? null} pref={pref} onToggle={toggle} />
        </aside>
      )}
      <div className={app ? pad : ""}>
        <TopBar me={me} title={title} variant={variant} onMenu={() => setDrawer(true)} menuRef={menuRef} />
        {me?.ai === "stub" && <DevBanner />}
        {me && me.demo_day_offset !== 0 && <DemoDateBanner today={me.today} offset={me.demo_day_offset} />}
        <main className="px-4 pt-6 pb-24 md:px-8">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
      {app && <Drawer open={drawer} onClose={closeDrawer} loginId={me?.login_id ?? null} returnFocus={menuRef} />}
    </div>
  );
}
