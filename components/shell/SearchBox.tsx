"use client";
// Top bar search over the learner's units. Locked units are listed but not linked.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { LessonListItem, LessonsResponse } from "@/lib/api-types";
import { api, onDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { Icon } from "../icons";
import { StatusPill } from "../StatusPill";

const s = copy.shell;

function hrefFor(item: LessonListItem): string | null {
  if (item.state === "next") return "/lesson";
  if (item.state === "locked") return null;
  return `/lesson?unit=${encodeURIComponent(item.unit_id)}`;
}

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LessonListItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => onDayChange(() => setItems(null)), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function ensureItems() {
    if (items) return;
    const res = await api<LessonsResponse>("/api/lessons");
    if (res.ok) setItems(res.data.items);
    else setError(res.error);
  }

  const q = query.trim().toLowerCase();
  const results = (items ?? []).filter((i) => !q || i.title.toLowerCase().includes(q)).slice(0, 8);

  return (
    <div
      ref={boxRef}
      className="relative w-full max-w-md"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="relative block">
        <span className="sr-only">{s.search}</span>
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={query}
          placeholder={s.search}
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          onFocus={() => {
            void ensureItems();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
          className="h-tap w-full rounded-full border border-line bg-surface pr-4 pl-11 text-body text-ink focus:border-line-strong"
        />
      </label>
      {open && q.length > 0 && (
        <div id={listId} className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-card border border-line bg-surface p-2 shadow-popover">
          {error && <p className="p-3 text-small text-danger">{error}</p>}
          {!items && !error && <p className="p-3 text-small text-ink-muted">{s.searchLoading}</p>}
          {items && results.length === 0 && <p className="p-3 text-small text-ink-muted">{s.searchNone}</p>}
          <ul>
            {results.map((item) => {
              const href = hrefFor(item);
              const body = (
                <>
                  <span className={`min-w-0 flex-1 truncate ${href ? "text-ink" : "text-ink-muted"}`}>{item.title}</span>
                  <StatusPill state={item.state} />
                </>
              );
              return (
                <li key={item.unit_id}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-tap items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-muted"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div aria-disabled="true" className="flex min-h-tap items-center gap-3 rounded-control px-3 py-2">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
