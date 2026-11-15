"use client";
// The second way in: a learner pastes the text of a course they already have, or picks a .txt/.md
// file that is read here in the browser. POST /api/course { source: "upload" } runs the setup call,
// which can take most of a minute; the flow then continues with the survey.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import { Button, Card, ErrorCard, Spinner } from "@/components/ui";
import { STAGE_HOME, useGate } from "@/components/useGate";
import { api, clearDraft, type ApiResult } from "@/lib/client";
import { enterCopy, sourceCopy, uploadCopy as c, type CourseSource } from "@/lib/copy/pages";
import { COURSE_TEXT_MIN_CHARS, PDF_MAX_BYTES, UPLOAD_MAX_CHARS, UPLOAD_MIN_CHARS } from "@/lib/upload";

/** POST /api/course */
interface CourseResponse {
  course_plan_id: string;
  title: string;
  source: CourseSource;
  units: { unit_id: string; title: string }[];
  /** True when the learner already has lessons, so their course was left as it is. */
  kept: boolean;
}

type Phase = "edit" | "building" | "sample" | "built";
type Action = "build" | "sample";
type Failure = Extract<ApiResult<unknown>, { ok: false }>;
type Problem = { kind: "retry"; message: string; action: Action } | { kind: "signed_out"; message: string };

const TEXT_FILE = /\.(txt|md|markdown)$/i;
const PDF_FILE = /\.pdf$/i;
const MAX_FILE_BYTES = 1_000_000;

export default function UploadPage() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["start", "survey"]);
  const [phase, setPhase] = useState<Phase>("edit");
  const [text, setText] = useState("");
  const [built, setBuilt] = useState<Pick<CourseResponse, "title" | "units" | "source"> | null>(null);
  /** Whether the sample course is the one attached to this learner right now. */
  const [hasSample, setHasSample] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadingText, setLoadingText] = useState<"pdf" | "example" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [seconds, setSeconds] = useState(0);
  const busy = useRef(false);
  const seeded = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const builtRef = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();

  // A learner who comes back after their own course was built sees it, not an empty form.
  useEffect(() => {
    if (!me || seeded.current) return;
    seeded.current = true;
    setHasSample(me.sample !== null);
    if (me.course && me.sample === null) {
      setBuilt({ title: me.course.title, units: me.course.units, source: me.course.source });
      setPhase("built");
    }
  }, [me]);

  useEffect(() => {
    if (phase !== "building") return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "built") builtRef.current?.focus();
  }, [phase]);

  if (gateError) {
    return (
      <AppShell me={null} variant="flow">
        <ErrorCard message={gateError} onRetry={reload} />
      </AppShell>
    );
  }
  if (!me) {
    return (
      <AppShell me={me} variant="flow">
        <Spinner />
      </AppShell>
    );
  }

  const length = text.trim().length;
  const tooLong = length > UPLOAD_MAX_CHARS;
  const shownFieldError = tooLong ? c.tooLong : fieldError;

  function fail(res: Failure, action: Action) {
    setPhase("edit");
    if (res.status === 401) return setProblem({ kind: "signed_out", message: c.signedOut });
    if (res.code === "too_short" || res.code === "too_long") return setFieldError(res.error);
    // No JSON error body means the host ended the request: the setup call ran out of time.
    const message = action === "build" && res.code === "error" && res.status >= 500 ? c.slow : res.error;
    setProblem({ kind: "retry", message, action });
  }

  /** An error from the last attempt was about the text as it was then; once the text changes it no longer applies. */
  function clearRetry() {
    setProblem((p) => (p?.kind === "retry" ? null : p));
  }

  async function build() {
    if (busy.current) return;
    const body = text.trim();
    setProblem(null);
    if (body.length < UPLOAD_MIN_CHARS) return setFieldError(c.tooShort);
    if (body.length > UPLOAD_MAX_CHARS) return setFieldError(c.tooLong);
    busy.current = true;
    setFieldError(null);
    setPhase("building");
    const res = await api<CourseResponse>("/api/course", { method: "POST", body: { source: "upload", text: body } });
    busy.current = false;
    if (!res.ok) return fail(res, "build");
    // The survey draft may hold topics from the course this one replaces.
    clearDraft("survey");
    if (res.data.kept) return router.replace(STAGE_HOME.lesson);
    setHasSample(false);
    setBuilt({ title: res.data.title, units: res.data.units, source: res.data.source });
    setPhase("built");
  }

  async function pickSample() {
    if (busy.current) return;
    if (hasSample) return router.push(STAGE_HOME.survey);
    busy.current = true;
    setProblem(null);
    setPhase("sample");
    const res = await api<CourseResponse>("/api/course", { method: "POST", body: { source: "sample" } });
    busy.current = false;
    if (!res.ok) return fail(res, "sample");
    clearDraft("survey");
    router.push(res.data.kept ? STAGE_HOME.lesson : STAGE_HOME.survey);
  }

  /** Puts loaded text in the box, like a paste. */
  function fill(content: string, note: string) {
    setText(content);
    setFieldError(null);
    clearRetry();
    setFileNote({ ok: true, text: note });
  }

  async function loadExample() {
    setLoadingText("example");
    const res = await api<{ text: string }>("/api/course/example");
    setLoadingText(null);
    if (!res.ok) return setFileNote({ ok: false, text: c.exampleFailed });
    fill(res.data.text, c.exampleLoaded);
  }

  /** The server reads the PDF's text layer and sends the text back; the plan is then built like any pasted text. */
  async function onPdf(file: File) {
    if (file.size > PDF_MAX_BYTES) return setFileNote({ ok: false, text: c.pdfTooBig });
    setLoadingText("pdf");
    setFileNote(null);
    try {
      const res = await fetch("/api/course/pdf", { method: "POST", headers: { "content-type": "application/pdf" }, body: file, credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (res.status === 401) return setProblem({ kind: "signed_out", message: c.signedOut });
      if (!res.ok || typeof data.text !== "string") return setFileNote({ ok: false, text: data.error || c.pdfUnreadable });
      fill(data.text, c.fileLoaded(file.name));
    } catch {
      setFileNote({ ok: false, text: c.pdfUnreadable });
    } finally {
      setLoadingText(null);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again is noticed
    if (!file) return;
    if (PDF_FILE.test(file.name) || file.type === "application/pdf") return onPdf(file);
    if (!TEXT_FILE.test(file.name)) return setFileNote({ ok: false, text: c.fileWrongType });
    if (file.size > MAX_FILE_BYTES) return setFileNote({ ok: false, text: c.fileTooBig });
    try {
      const content = await file.text();
      if (content.includes("\u0000")) return setFileNote({ ok: false, text: c.fileUnreadable });
      if (content.trim() === "") return setFileNote({ ok: false, text: c.fileEmpty });
      fill(content, c.fileLoaded(file.name));
    } catch {
      setFileNote({ ok: false, text: c.fileUnreadable });
    }
  }

  return (
    <AppShell me={me} variant="flow" title={c.title}>
      <div className="mx-auto max-w-reading space-y-6">
        {phase === "built" && built && (
          <Card className="space-y-4">
            <div className="space-y-1">
              <h1 ref={builtRef} tabIndex={-1} className="text-h1 text-ink outline-none">
                {c.doneTitle(built.units.length)}
              </h1>
              <p className="text-body text-ink-muted">{sourceCopy(built.source).builtFrom(built.title)}</p>
            </div>
            <ol className="space-y-2">
              {built.units.map((u, i) => (
                <li key={u.unit_id} className="flex gap-3 text-body text-ink">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-small font-semibold" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words pt-0.5">{u.title}</span>
                </li>
              ))}
            </ol>
            <p className="text-body text-ink-muted">{c.doneNext}</p>
            <Button className="h-12 w-full" onClick={() => router.push(STAGE_HOME.survey)}>
              {enterCopy.startSurvey}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPhase("edit")}>
              {c.replace}
            </Button>
          </Card>
        )}

        {phase === "building" && (
          <Card className="space-y-3">
            <div role="status" className="flex items-center gap-3">
              <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
              <h1 className="text-h2 text-ink">{c.waitingTitle}</h1>
            </div>
            <p className="text-body text-ink-muted">{length < COURSE_TEXT_MIN_CHARS ? c.waitingLineTopic : c.waitingLine}</p>
            <p className="text-small text-ink-muted" aria-hidden>
              {c.waitingElapsed(seconds)}
            </p>
          </Card>
        )}

        {phase === "sample" && (
          <Card>
            <Spinner label={c.loadingSample} />
          </Card>
        )}

        {phase === "edit" && (
          <>
            <div className="space-y-2">
              <h1 className="text-h1 text-ink">{c.heading}</h1>
              <p className="text-body text-ink-muted">{c.intro}</p>
            </div>

            {problem?.kind === "retry" && (
              <ErrorCard message={problem.message} onRetry={() => void (problem.action === "build" ? build() : pickSample())} />
            )}
            {problem?.kind === "signed_out" && (
              <section className="space-y-4 rounded-card border border-danger/30 bg-danger-soft p-5">
                <p role="alert" className="flex gap-3 text-body text-ink">
                  <Icon name="alert" className="mt-0.5 size-5 text-danger" />
                  <span>{problem.message}</span>
                </p>
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => router.push("/enter")}>
                  {c.toEnter}
                </Button>
              </section>
            )}

            <Card className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <label htmlFor={fieldId} className="text-small font-semibold text-ink">
                  {c.fieldLabel}
                </label>
                <p className={`text-small ${tooLong ? "font-semibold text-danger" : "text-ink-muted"}`}>{c.counter(length, UPLOAD_MAX_CHARS)}</p>
              </div>
              <textarea
                id={fieldId}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFieldError(null);
                  clearRetry();
                }}
                rows={12}
                spellCheck={false}
                placeholder={c.placeholder}
                aria-invalid={!!shownFieldError}
                aria-describedby={shownFieldError ? `${errorId} ${helpId}` : helpId}
                className="block w-full resize-y rounded-control border border-line-strong bg-surface p-4 text-body text-ink"
              />
              {shownFieldError && (
                <p id={errorId} role="alert" className="flex items-start gap-2 text-small font-semibold text-danger">
                  <Icon name="alert" className="mt-0.5 size-4" />
                  {shownFieldError}
                </p>
              )}

              <div className="space-y-2">
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="w-full sm:w-auto" busy={loadingText === "pdf"} busyLabel={c.readingPdf} disabled={loadingText !== null} onClick={() => fileRef.current?.click()}>
                    {c.chooseFile}
                  </Button>
                  <Button variant="secondary" className="w-full sm:w-auto" busy={loadingText === "example"} disabled={loadingText !== null} onClick={() => void loadExample()}>
                    {c.tryExample}
                  </Button>
                </div>
                {fileNote && (
                  <p role={fileNote.ok ? "status" : "alert"} className={`text-small ${fileNote.ok ? "text-ink" : "font-semibold text-danger"}`}>
                    {fileNote.text}
                  </p>
                )}
                <p id={helpId} className="text-small text-ink-muted">
                  {c.fileHelp}
                </p>
              </div>

              <p className="flex items-start gap-2 rounded-control bg-surface-muted p-3 text-small text-ink-muted">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                {c.caution}
              </p>
            </Card>

            <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
              <Button className="h-12 w-full" onClick={() => void build()}>
                {c.submit}
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => void pickSample()}>
              {c.useSample}
            </Button>
          </>
        )}
      </div>
    </AppShell>
  );
}
