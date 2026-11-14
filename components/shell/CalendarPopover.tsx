"use client";
// Calendar button (last item in the top bar) and its popover: month grid, pace line, demo controls.
import { useEffect, useId, useRef, useState } from "react";
import type { MeResponse } from "@/lib/api-types";
import { copy } from "@/lib/content";
import { ErrorCard, IconButton, Skeleton } from "../ui";
import { CalendarHeader, CalendarMonth } from "./CalendarMonth";
import { DemoControls } from "./DemoControls";
import { PaceLine } from "./PaceLine";
import { useCalendar } from "./useCalendar";

const c = copy.calendar;

export function CalendarButton({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const cal = useCalendar(open);
  const offset = cal.data?.demo_day_offset ?? me.demo_day_offset;

  function close(returnFocus = true) {
    setOpen(false);
    cal.resetMonth();
    if (returnFocus) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]); // close() only touches refs and setters

  // Move focus into the dialog once, when it opens (not again after Skip refreshes the data).
  const focused = useRef(false);
  useEffect(() => {
    if (!open) {
      focused.current = false;
      return;
    }
    if (focused.current) return;
    const heading = panelRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(titleId)}"]`);
    (heading ?? panelRef.current)?.focus();
    if (cal.data) focused.current = true;
  }, [open, cal.data, titleId]);

  return (
    <div className="relative">
      <IconButton
        ref={buttonRef}
        icon="calendar"
        label={open ? c.close : c.open}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className={open ? "bg-sidebar-active text-ink" : ""}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {offset > 0 && (
          <>
            <span className="absolute top-2 right-2 size-2 rounded-full bg-warn" aria-hidden />
            <span className="sr-only">{c.demoActive}</span>
          </>
        )}
      </IconButton>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !panelRef.current?.contains(to) && !buttonRef.current?.contains(to)) close(false);
          }}
          className="fixed inset-x-4 top-[calc(var(--spacing-topbar-mobile)+0.5rem)] z-50 max-h-[calc(100dvh-var(--spacing-topbar-mobile)-1rem)] space-y-4 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-popover md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2 md:w-popover md:max-h-[calc(100dvh-var(--spacing-topbar)-1rem)]"
        >
          {cal.error && <ErrorCard message={cal.error} onRetry={cal.reload} />}
          {!cal.data && !cal.error && (
            <div className="space-y-3" role="status" aria-label={c.loading}>
              <h2 id={titleId} tabIndex={-1} className="sr-only">
                {c.loading}
              </h2>
              <Skeleton lines={6} />
            </div>
          )}
          {cal.data && (
            <>
              <CalendarHeader month={cal.data.month} titleId={titleId} onPrev={cal.prev} onNext={cal.next} />
              <CalendarMonth data={cal.data} />
              <div className="border-t border-line pt-4">
                <PaceLine pace={cal.data.pace} />
              </div>
              <DemoControls today={cal.data.today} onReset={() => close(false)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
