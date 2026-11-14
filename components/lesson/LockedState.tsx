import Link from "next/link";
import { Icon } from "@/components/icons";
import { lessonCopy } from "@/lib/copy/pages";

/** Shown when a locked unit is requested. `message` comes from the server ("“X” unlocks after you pass “Y”."). */
export function LockedState({ message }: { message: string }) {
  return (
    <section className="space-y-4 rounded-card bg-locked-soft p-5 md:p-6" aria-live="polite">
      <div className="flex items-center gap-2 text-locked">
        <Icon name="lock" className="size-6" />
        <h1 className="text-h2">{lessonCopy.lockedTitle}</h1>
      </div>
      <p className="text-body text-ink">{message}</p>
      <Link
        href="/lesson"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover"
      >
        {lessonCopy.toOpenLesson}
        <Icon name="arrow-right" />
      </Link>
    </section>
  );
}
