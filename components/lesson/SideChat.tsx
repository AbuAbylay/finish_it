"use client";
// Side chat about the open lesson (Haiku, off the critical path). Rendered only when the real AI layer is on.
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import type { ChatTurn } from "@/lib/types";
import { api } from "@/lib/client";
import { useSourceCopy } from "@/components/CourseSource";
import { lessonCopy as t } from "@/lib/copy/pages";
import { Markdown } from "@/components/Markdown";

/** The model gets the last few turns; the page keeps the whole conversation on screen. */
const RECENT_TURNS = 12;

export function SideChat({ lessonKey }: { lessonKey: string }) {
  const source = useSourceCopy();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const res = await api<{ answer: string }>("/api/chat", { method: "POST", body: { lesson_key: lessonKey, question: q, history: history.slice(-RECENT_TURNS) } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setHistory([...history, { role: "user", content: q }, { role: "assistant", content: res.data.answer }]);
    setQuestion("");
  }

  if (!open) {
    return (
      <p className="text-body text-ink-muted">
        {t.chatInvite}{" "}
        <button type="button" onClick={() => setOpen(true)} className="min-h-tap font-semibold text-ink underline underline-offset-4">
          {t.chatInviteAction}
        </button>
      </p>
    );
  }

  return (
    <section aria-labelledby="chat-title" className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 id="chat-title" className="text-h3 text-ink">
        {t.chatInviteAction}
      </h2>
      {history.length === 0 && <p className="text-small text-ink-muted">{source.chatEmpty}</p>}
      <ul className="space-y-2" aria-live="polite">
        {history.map((m, i) => (
          <li key={i} className={`rounded-control p-3 text-body ${m.role === "user" ? "bg-surface-muted text-ink" : "border border-line text-ink"}`}>
            {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          {error}
        </p>
      )}
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="chat-q" className="sr-only">
          {t.chatPlaceholder}
        </label>
        <input
          id="chat-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          placeholder={t.chatPlaceholder}
          className="h-tap min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-body text-ink"
        />
        <Button type="submit" variant="secondary" disabled={busy || !question.trim()}>
          {busy ? t.chatThinking : t.chatSend}
        </Button>
      </form>
    </section>
  );
}
