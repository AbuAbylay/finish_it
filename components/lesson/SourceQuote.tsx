// "From your course": the visible proof that a lesson is grounded in the learner's material.
import { lessonCopy } from "@/lib/copy/pages";

export function SourceQuote({ quote, label = lessonCopy.fromCourse }: { quote: string; label?: string }) {
  return (
    <blockquote className="rounded-r-control border-l-4 border-accent bg-accent-soft/50 py-2 pr-3 pl-4">
      <span className="block text-caption uppercase text-accent-strong">{label}</span>
      <span className="text-body text-ink italic">“{quote}”</span>
    </blockquote>
  );
}
