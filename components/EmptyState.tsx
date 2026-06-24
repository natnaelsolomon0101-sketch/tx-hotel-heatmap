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
  message = "Try zooming out, panning the map, or loosening your filters.",
  onClear,
  clearLabel = "Clear filters",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-3.6-3.6" />
          <path d="M8.5 11h5" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 max-w-[15rem] text-[12px] leading-snug text-gray-400">
        {message}
      </p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
