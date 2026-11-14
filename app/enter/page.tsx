"use client";
// First page: start in one tap with a generated ID (sample course, or the learner's own course text),
// or type an ID to continue. The ID is a stand-in for sign-in; the server keeps the session (lib/identity.ts).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Button, Spinner } from "@/components/ui";
import { STAGE_HOME } from "@/components/useGate";
import type { EnterResponse, GenerateResponse, MeResponse } from "@/lib/api-types";
import { LOGIN_ID_HINT, isValidLoginId, normalizeLoginId } from "@/lib/login-id";
import { api, signOut } from "@/lib/client";
import { enterCopy as c } from "@/lib/copy/pages";

type Phase = "loading" | "new" | "returning" | "generated";
/** Which course the new learner asked for. A new ID always starts with the sample attached; /upload replaces it. */
type Course = "sample" | "own";

function BrandMark() {
  return (
    <div className="flex items-center gap-2 text-h3 text-ink">
      <span className="grid size-8 place-items-center rounded-control bg-accent text-on-primary" aria-hidden>
        <Icon name="check" />
      </span>
      Finish-it coach
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-small text-danger">
      <Icon name="alert" className="mt-0.5 size-4" />
      {message}
    </p>
  );
}

export default function EnterPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sample, setSample] = useState<"real" | "dev" | null>(null);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const [generating, setGenerating] = useState<Course | null>(null);
  const [course, setCourse] = useState<Course>("sample");
  const [genError, setGenError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const idRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    void (async () => {
      const [meRes, health] = await Promise.all([api<MeResponse>("/api/me"), api<{ sample: "real" | "dev" | null }>("/api/health")]);
      if (health.ok) setSample(health.data.sample);
      if (meRes.ok) {
        setMe(meRes.data);
        setPhase("returning");
      } else {
        setPhase("new");
      }
    })();
  }, []);

  async function generate(wanted: Course) {
    if (generating) return;
    setGenerating(wanted);
    setGenError(null);
    const res = await api<GenerateResponse>("/api/identity/generate", { method: "POST" });
    setGenerating(null);
    if (!res.ok) return setGenError(res.error);
    setCourse(wanted);
    setLoginId(res.data.login_id);
    setPhase("generated");
  }

  async function copyId() {
    if (!loginId) return;
    try {
      await navigator.clipboard.writeText(loginId);
      setCopied("yes");
    } catch {
      setCopied("failed");
      const range = document.createRange();
      if (idRef.current) {
        range.selectNodeContents(idRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  async function enter(e: FormEvent) {
    e.preventDefault();
    if (entering) return;
    // A slip of the keyboard is caught here, without a request and without counting as a failed lookup.
    if (!isValidLoginId(normalizeLoginId(typed))) return setEnterError(LOGIN_ID_HINT);
    setEntering(true);
    setEnterError(null);
    const res = await api<EnterResponse>("/api/identity/enter", { method: "POST", body: { login_id: typed } });
    if (!res.ok) {
      setEntering(false);
      return setEnterError(res.error);
    }
    router.push(STAGE_HOME[res.data.stage]);
  }

  async function startOver() {
    await signOut();
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-topbar-mobile max-w-content items-center px-4 md:h-topbar md:px-8">
        <BrandMark />
      </header>

      <main className="mx-auto grid max-w-content gap-8 px-4 pt-4 pb-16 md:grid-cols-[1.1fr_1fr] md:gap-12 md:px-8 md:pt-12">
        <div className="space-y-6">
          <h1 className="text-display text-ink md:text-display-lg">{c.headline}</h1>
          <p className="text-body-lg text-ink-muted">{c.subhead}</p>
          <ol className="space-y-4">
            {c.steps.map((s, i) => (
              <li key={s.lead} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-small font-semibold text-ink" aria-hidden>
                  {i + 1}
                </span>
                <p className="text-body text-ink">
                  <strong className="font-semibold">{s.lead}</strong> <span className="text-ink-muted">{s.rest}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="start-title" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="band-green h-16" aria-hidden />
            <div className="space-y-4 p-5 md:p-6">
              {phase === "loading" && <Spinner />}

              {phase === "new" && (
                <>
                  <h2 id="start-title" className="sr-only">
                    {c.primary}
                  </h2>
                  <Button className="h-12 w-full" onClick={() => void generate("sample")} disabled={generating !== null}>
                    {generating === "sample" ? c.creating : c.primary}
                    {generating !== "sample" && <Icon name="arrow-right" />}
                  </Button>
                  <p className="text-center text-small text-ink-muted">{c.underButton}</p>
                  <div className="space-y-2 border-t border-line pt-4">
                    <Button variant="secondary" className="w-full" onClick={() => void generate("own")} disabled={generating !== null}>
                      {generating === "own" ? c.creating : c.ownCourse}
                    </Button>
                    <p className="text-center text-small text-ink-muted">{c.ownCourseHelp}</p>
                  </div>
                  {genError && <InlineError message={genError} />}
                </>
              )}

              {phase === "generated" && loginId && (
                <>
                  <h2 id="start-title" className="text-caption uppercase text-ink-muted">
                    {c.yourIdLabel}
                  </h2>
                  <div className="flex items-center gap-2 rounded-control bg-surface-muted p-3">
                    <p ref={idRef} className="min-w-0 flex-1 font-mono text-h3 text-ink">
                      {loginId.split("-").map((group, i, all) => (
                        <span key={i} className="whitespace-nowrap">
                          {group}
                          {i < all.length - 1 && "-"}
                          <wbr />
                        </span>
                      ))}
                    </p>
                    <Button variant="secondary" onClick={copyId} aria-label={`${c.copy} ${c.yourIdLabel}`}>
                      <Icon name={copied === "yes" ? "check" : "copy"} />
                      <span aria-live="polite">{copied === "yes" ? c.copied : c.copy}</span>
                    </Button>
                  </div>
                  {copied === "failed" && <p className="text-small text-ink-muted">{c.copyFailed}</p>}
                  <p className="flex items-start gap-2 rounded-control bg-warn-soft p-3 text-small text-ink">
                    <Icon name="info" className="mt-0.5 size-4 text-warn" />
                    {c.idWarning}
                  </p>
                  <Button className="h-12 w-full" onClick={() => router.push(course === "own" ? "/upload" : STAGE_HOME.survey)}>
                    {course === "own" ? c.addCourse : c.startSurvey}
                    <Icon name="arrow-right" />
                  </Button>
                </>
              )}

              {phase === "returning" && me && (
                <>
                  <h2 id="start-title" className="text-h2 text-ink">
                    {c.welcomeBack}
                  </h2>
                  <Button className="h-12 w-full" onClick={() => router.push(STAGE_HOME[me.stage])}>
                    {me.stage === "lesson" || me.stage === "done" ? c.continueLesson : c.continueSetup}
                    <Icon name="arrow-right" />
                  </Button>
                  {me.stage === "survey" && (
                    <Button variant="secondary" className="w-full" onClick={() => router.push("/upload")}>
                      {c.ownCourse}
                    </Button>
                  )}
                  <Button variant="ghost" className="w-full" onClick={startOver}>
                    {c.startOver}
                  </Button>
                </>
              )}
            </div>
          </section>

          {phase !== "returning" && phase !== "generated" && (
            <section aria-labelledby="have-id" className="rounded-card border border-line bg-surface p-5 shadow-card md:p-6">
              <h2 id="have-id" className="text-h3 text-ink">
                {c.haveId}
              </h2>
              <p className="text-small text-ink-muted">{c.haveIdHelp}</p>
              <form onSubmit={enter} className="mt-4 space-y-3" noValidate>
                <label htmlFor="login-id" className="block text-small font-semibold text-ink">
                  {c.yourIdLabel}
                </label>
                <input
                  id="login-id"
                  name="login-id"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={60}
                  placeholder={c.idPlaceholder}
                  aria-invalid={!!enterError}
                  aria-describedby={enterError ? "login-id-error" : undefined}
                  className="h-12 w-full rounded-control border border-line-strong bg-surface px-4 font-mono text-body text-ink"
                />
                {enterError && (
                  <div id="login-id-error">
                    <InlineError message={enterError} />
                  </div>
                )}
                <Button type="submit" variant="secondary" className="w-full" disabled={entering || typed.trim().length === 0}>
                  {entering ? c.checking : c.continue}
                </Button>
              </form>
            </section>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-content space-y-1 border-t border-line px-4 py-6 text-small text-ink-muted md:px-8">
        {sample === "real" && <p>{c.creditSampleReal}</p>}
        {sample === "dev" && <p>{c.creditSampleDev}</p>}
        <p>{c.creditMethod}</p>
      </footer>
    </div>
  );
}
