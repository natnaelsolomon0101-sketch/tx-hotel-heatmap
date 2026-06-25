"use client";

/**
 * Compact empty state for the property list when no rows match the current
 * view / search / bucket filters. Matches the panel typography; offers an
 * optional "Clear filters" action.
 */

type EmptyStateProps = {
  /** Headline, e.g. "No properties match". */
  title?: string;
  /** Supporting hint line. */
  message?: string;
  /** When provided, renders a "Clear filters" button wired to this handler. */
  onClear?: () => void;
  /** Override the action button label. */
  clearLabel?: string;
};

export default function EmptyState({
  title = "No properties match",
  message = "Zoom out, pan the map, or loosen your filters to see more.",
  onClear,
  clearLabel = "Clear filters",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-subtle">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-3.6-3.6" />
          <path d="M8.5 11h5" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-display text-foreground">{title}</p>
        <p className="mx-auto max-w-[15rem] text-meta leading-snug text-muted-foreground">
          {message}
        </p>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="rounded-lg bg-ink px-4 py-2 text-meta font-semibold text-white transition-base hover:bg-ink-hover"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
