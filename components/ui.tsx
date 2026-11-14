"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { copy } from "@/lib/content";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-stone-900 text-white hover:bg-stone-700 disabled:bg-stone-300 disabled:text-stone-500",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export function Chip({
  selected,
  onClick,
  children,
  tone = "default",
  compact = false,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "skip";
  /** Narrow centered chip, for grids like weekdays. */
  compact?: boolean;
  className?: string;
}) {
  const on = tone === "skip" ? "border-stone-400 bg-stone-200 text-stone-500 line-through" : "border-emerald-700 bg-emerald-50 text-emerald-900";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-12 rounded-xl border py-2 text-base transition-colors ${compact ? "px-1 text-center" : "px-4 text-left"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${selected ? on : "border-stone-300 bg-white text-stone-800 hover:border-stone-400"} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-stone-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorCard({ message, onRetry, retryable = true }: { message: string; onRetry?: () => void; retryable?: boolean }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <p role="alert" className="text-base text-rose-900">
        {message || copy.errors.generic}
      </p>
      {onRetry && retryable && (
        <Button className="mt-4 w-full sm:w-auto" onClick={onRetry}>
          {copy.errors.retry}
        </Button>
      )}
    </Card>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 rounded bg-stone-200" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}
