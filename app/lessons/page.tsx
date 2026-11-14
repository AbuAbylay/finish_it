"use client";
// Every unit in plan order with its state. The server computes states (GET /api/lessons); this page never applies rules.
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LessonRow } from "@/components/lesson/LessonRow";
import { ErrorCard } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { LessonListItem, LessonsResponse } from "@/lib/api-types";
import { api } from "@/lib/client";
import { lessonsCopy as l } from "@/lib/copy/pages";

function hrefFor(item: LessonListItem): string | null {
  if (item.state === "next") return "/lesson";
  if (item.state === "locked") return null;
  return `/lesson?unit=${encodeURIComponent(item.unit_id)}`;
}

export default function LessonsPage() {
  const { me, error: gateError, reload } = useGate(["lesson", "done"]);
  const [data, setData] = useState<LessonsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await api<LessonsResponse>("/api/lessons");
    if (res.ok) setData(res.data);
    else setError(res.error);
  }

  useEffect(() => {
    if (me) void load();
  }, [me]);

  return (
    <AppShell me={me} title={l.title}>
      <div className="mx-auto max-w-content space-y-5">
        <div className="space-y-1">
          <h1 className="text-h1 text-ink">{l.heading}</h1>
          {data && <p className="text-body text-ink-muted">{l.sub(data.course_title)}</p>}
        </div>

        {(gateError || error) && <ErrorCard message={gateError ?? error ?? ""} onRetry={gateError ? reload : load} />}

        {!data && !gateError && !error && (
          <ul className="space-y-2" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex min-h-[72px] items-center gap-3 rounded-control border border-line bg-surface p-3">
                <div className="skeleton h-14 w-date-block" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && (
          <ol className="space-y-2">
            {data.items.map((item) => (
              <li key={item.unit_id}>
                <LessonRow item={item} today={data.today} href={hrefFor(item)} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}
