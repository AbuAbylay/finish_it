"use client";
// The course's own words: set in the course face (serif) with the marker stroke behind them, so a reader can
// tell them from the coach's text without reading the label. For a plan built from AI-written study notes
// the label says so instead of "From your course".
import { useSourceCopy } from "@/components/CourseSource";

export function SourceQuote({ quote, label, marked = true }: { quote: string; label?: string; /** false for a long passage shown whole: no marker. */ marked?: boolean }) {
  const source = useSourceCopy();
  return (
    <figure className="space-y-1">
      <figcaption className="text-caption text-ink-muted">{label ?? source.quoteLabel}</figcaption>
      <blockquote className="font-serif text-body-lg whitespace-pre-line text-ink">
        {marked ? <span className="course-quote">“{quote}”</span> : quote}
      </blockquote>
    </figure>
  );
}
