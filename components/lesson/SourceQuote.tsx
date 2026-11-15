"use client";
// "From your course": the visible proof that a lesson is grounded in the learner's material. For a plan
// built from AI-written study notes the label says so instead.
import { useSourceCopy } from "@/components/CourseSource";

export function SourceQuote({ quote, label }: { quote: string; label?: string }) {
  const source = useSourceCopy();
  return (
    <blockquote className="rounded-r-control border-l-4 border-accent bg-accent-soft/50 py-2 pr-3 pl-4">
      <span className="block text-caption uppercase text-accent-strong">{label ?? source.quoteLabel}</span>
      <span className="text-body text-ink italic">“{quote}”</span>
    </blockquote>
  );
}
