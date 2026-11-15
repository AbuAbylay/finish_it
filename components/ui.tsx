"use client";
// Shared building blocks, styled only with the tokens in docs/design.md.
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { copy } from "@/lib/content";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "min-h-12 bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
  ghost: "text-ink-muted hover:bg-sidebar-active hover:text-ink",
  danger: "bg-danger text-on-primary hover:opacity-90",
};

const disabledCls =
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-muted disabled:text-ink-faint disabled:hover:bg-surface-muted";

export function Button({
  variant = "primary",
  busy = false,
  busyLabel,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; busyLabel?: string }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-tap items-center justify-center gap-2 rounded-control px-5 text-body font-semibold transition-colors duration-150 ${variants[variant]} ${disabledCls} ${className}`}
      {...rest}
    >
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/** Square icon-only button. `label` becomes the accessible name and tooltip. */
export function IconButton({
  icon,
  label,
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative inline-flex size-tap shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 hover:bg-sidebar-active hover:text-ink ${className}`}
      {...rest}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

/** Card: a 1 px border on the sheet, no shadow. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface p-5 md:p-6 ${className}`}>{children}</section>;
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
  const on =
    tone === "skip"
      ? "border-line-strong bg-locked-soft text-locked ring-1 ring-inset ring-line-strong"
      : "border-ink bg-surface text-ink ring-1 ring-inset ring-ink";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-tap rounded-control border py-2 text-body transition-colors duration-150 ${compact ? "px-1 text-center" : "flex items-center justify-between gap-3 px-4 text-left"} ${selected ? on : "border-line-strong bg-surface text-ink hover:border-ink"} ${className}`}
    >
      {compact ? (
        children
      ) : (
        <>
          <span className={selected && tone === "skip" ? "line-through" : ""}>{children}</span>
          {selected && tone === "default" && <Icon name="check" className="size-5 text-ink" />}
          {selected && tone === "skip" && <span className="shrink-0 text-small font-semibold no-underline">{copy.survey.q4.skipTag}</span>}
        </>
      )}
    </button>
  );
}

/** Small status pill with an icon and a label. For lesson states use StatusPill. */
export function Pill({ icon, label, tone = "neutral" }: { icon: IconName; label: string; tone?: "neutral" | "accent" | "warn" | "info" | "danger" }) {
  const tones = {
    neutral: "bg-surface-muted text-ink-muted",
    accent: "bg-accent-soft text-accent-strong",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-small font-semibold ${tones[tone]}`}>
      <Icon name={icon} className="size-4" />
      {label}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-ink-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorCard({ message, onRetry, retryable = true }: { message: string; onRetry?: () => void; retryable?: boolean }) {
  return (
    <section className="rounded-card border border-danger/30 bg-danger-soft p-5">
      <p role="alert" className="flex gap-3 text-body text-ink">
        <Icon name="alert" className="mt-0.5 size-5 text-danger" />
        <span>{message || copy.errors.generic}</span>
      </p>
      {onRetry && retryable && (
        <Button variant="secondary" className="mt-4 w-full sm:w-auto" onClick={onRetry}>
          <Icon name="refresh" />
          {copy.errors.retry}
        </Button>
      )}
    </section>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}
