"use client";
// Sidebar content (nav + ID block), the desktop rail/sidebar, and the mobile drawer.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { signOut } from "@/lib/client";
import { copy } from "@/lib/content";
import { Icon, type IconName } from "../icons";
import { IconButton } from "../ui";

const s = copy.shell;

/** "expanded" / "collapsed" when the learner chose; null = default by width (rail 768-1279, full at 1280+). */
export type SidebarPref = "expanded" | "collapsed" | null;

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: s.nav.home, icon: "home" },
  { href: "/lessons", label: s.nav.lessons, icon: "lessons" },
  { href: "/plan", label: s.nav.plan, icon: "plan" },
];

/** Label visibility: always visible in the drawer; in the desktop sidebar it follows the preference. */
function labelCls(pref: SidebarPref, inDrawer: boolean): string {
  if (inDrawer || pref === "expanded") return "";
  if (pref === "collapsed") return "sr-only";
  return "sr-only xl:not-sr-only";
}

function Brand({ pref, inDrawer }: { pref: SidebarPref; inDrawer: boolean }) {
  return (
    <Link href="/" className="flex min-h-tap items-center gap-3 rounded-control px-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-on-primary" aria-hidden>
        <Icon name="check" className="size-5" />
      </span>
      <span className={`text-h3 whitespace-nowrap text-ink ${labelCls(pref, inDrawer)}`}>{copy.appName}</span>
    </Link>
  );
}

function maskId(id: string): string {
  const groups = id.split("-");
  if (groups.length >= 3) return groups.map((g, i) => (i === 0 || i === groups.length - 1 ? g : "•".repeat(g.length))).join("-");
  return id.length <= 6 ? "•".repeat(id.length) : `${id.slice(0, 3)}${"•".repeat(id.length - 6)}${id.slice(-3)}`;
}

function IdBlock({ loginId, pref, inDrawer }: { loginId: string | null; pref: SidebarPref; inDrawer: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const full = inDrawer || pref === "expanded";
  const auto = !inDrawer && pref === null; // CSS decides: full only at xl

  async function copyId() {
    if (!loginId) return;
    try {
      await navigator.clipboard.writeText(loginId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShown(true);
    }
  }

  const details = loginId && (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <p className="px-1 text-caption uppercase text-ink-muted">{s.yourId}</p>
        <div className="flex items-center">
          <IconButton icon="eye" label={shown ? s.hideId : s.showId} aria-pressed={shown} onClick={() => setShown((v) => !v)} />
          <IconButton icon={copied ? "check" : "copy"} label={copied ? s.copied : s.copyId} onClick={copyId} />
        </div>
      </div>
      <code className="block rounded-control bg-surface-muted px-2 py-1.5 font-mono text-small break-all text-ink">{shown ? loginId : maskId(loginId)}</code>
      <p className="sr-only" aria-live="polite">
        {copied ? s.copied : ""}
      </p>
    </div>
  );

  return (
    <div className="space-y-2 border-t border-line pt-3">
      {full && details}
      {auto && <div className="hidden xl:block">{details}</div>}
      <button
        type="button"
        onClick={() => void signOut()}
        title={s.signOut}
        className="flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-body text-ink-muted hover:bg-sidebar-active hover:text-ink"
      >
        <Icon name="sign-out" />
        <span className={labelCls(pref, inDrawer)}>{s.signOut}</span>
      </button>
    </div>
  );
}

export function SidebarContent({
  loginId,
  pref,
  inDrawer = false,
  onToggle,
}: {
  loginId: string | null;
  pref: SidebarPref;
  inDrawer?: boolean;
  onToggle?: () => void;
}) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Brand pref={pref} inDrawer={inDrawer} />
      <nav aria-label={s.menu} className="flex-1">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-tap items-center gap-3 rounded-control px-3 text-body ${active ? "bg-sidebar-active font-semibold text-ink" : "text-ink-muted hover:bg-sidebar-active/60 hover:text-ink"}`}
                >
                  <Icon name={item.icon} />
                  <span className={labelCls(pref, inDrawer)}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <IdBlock loginId={loginId} pref={pref} inDrawer={inDrawer} />
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-tap items-center gap-3 rounded-control px-3 text-small text-ink-muted hover:bg-sidebar-active hover:text-ink"
        >
          <Icon name={pref === "collapsed" ? "chevron-right" : pref === "expanded" ? "chevron-left" : "chevron-right"} className={pref === null ? "xl:rotate-180" : ""} />
          {pref === null ? (
            <>
              <span className="hidden xl:inline">{s.collapse}</span>
              <span className="sr-only xl:hidden">{s.expand}</span>
            </>
          ) : (
            <span className={labelCls(pref, false)}>{pref === "collapsed" ? s.expand : s.collapse}</span>
          )}
        </button>
      )}
    </div>
  );
}

export function sidebarWidth(pref: SidebarPref): { width: string; pad: string } {
  if (pref === "expanded") return { width: "md:w-sidebar", pad: "md:pl-sidebar" };
  if (pref === "collapsed") return { width: "md:w-sidebar-collapsed", pad: "md:pl-sidebar-collapsed" };
  return { width: "md:w-sidebar-collapsed xl:w-sidebar", pad: "md:pl-sidebar-collapsed xl:pl-sidebar" };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Mobile drawer: focus trapped, Escape and scrim close it, focus returns to the menu button. */
export function Drawer({
  open,
  onClose,
  loginId,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  loginId: string | null;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const lastPath = useRef(path);

  useEffect(() => {
    if (path !== lastPath.current) {
      lastPath.current = path;
      if (open) onClose();
    }
  }, [path, open, onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const trigger = returnFocus.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open, onClose, returnFocus]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label={s.closeMenu} className="absolute inset-0 bg-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={s.menu} className="relative h-full w-drawer max-w-[85vw] bg-sidebar shadow-popover">
        <div className="absolute top-2 right-2">
          <IconButton icon="close" label={s.closeMenu} onClick={onClose} />
        </div>
        <SidebarContent loginId={loginId} pref="expanded" inDrawer />
      </div>
    </div>
  );
}
