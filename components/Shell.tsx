"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { copy } from "@/lib/content";

export function Shell({ children, nav = false, demoOffset = 0 }: { children: ReactNode; nav?: boolean; demoOffset?: number }) {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${path === href ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-stone-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-700 text-sm text-white" aria-hidden>
              ✓
            </span>
            <span className="truncate">{copy.appName}</span>
          </Link>
          {nav && (
            <nav className="flex items-center gap-1">
              {demoOffset > 0 && (
                <span className="mr-1 hidden rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 sm:inline">
                  +{demoOffset}d
                </span>
              )}
              {link("/lesson", copy.nav.today)}
              {link("/plan", copy.nav.plan)}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-24">{children}</main>
    </div>
  );
}
