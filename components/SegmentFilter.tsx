"use client";

import { memo } from "react";
import type { Option } from "@/lib/enrichment";

type SegmentFilterProps = {
  /** Class/scale options present in the data (chain-scale ordered). */
  classOptions: Option[];
  /** Selected class values (empty = all). */
  activeClasses: Set<string>;
  onToggleClass: (value: string) => void;
  /** Submarket options present in the data (count-ordered). */
  submarketOptions: Option[];
  /** Selected submarket, or null for all. */
  submarket: string | null;
  onSubmarketChange: (value: string | null) => void;
  onReset: () => void;
};

/**
 * "Segment" filter — the compset-enrichment dimensions. Class/scale is a small,
 * fixed tier ladder rendered as toggle chips; submarket is a long list rendered
 * as a native dropdown. Both derive their options from the data actually
 * present, and the whole card hides itself when no hotel in the set is enriched.
 */
function SegmentFilter({
  classOptions,
  activeClasses,
  onToggleClass,
  submarketOptions,
  submarket,
  onSubmarketChange,
  onReset,
}: SegmentFilterProps) {
  // Nothing enriched in the loaded data → render nothing (clean pre-enrichment).
  if (classOptions.length === 0 && submarketOptions.length === 0) return null;

  const isFiltered = activeClasses.size > 0 || submarket != null;

  return (
    <div className="shrink-0 rounded-panel bg-surface p-3 shadow-sm ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="segment-filter-heading" className="label-overline">
          Class &amp; submarket
        </h2>
        <button
          type="button"
          onClick={onReset}
          aria-label="Clear class and submarket filters"
          disabled={!isFiltered}
          className={`text-xs font-medium transition-base ${
            isFiltered
              ? "text-accent hover:text-[hsl(var(--accent-hover))]"
              : "text-subtle"
          }`}
        >
          Reset
        </button>
      </div>

      {classOptions.length > 0 && (
        <div
          role="group"
          aria-labelledby="segment-filter-heading"
          className="flex flex-wrap gap-1.5"
        >
          {classOptions.map(({ value, count }) => {
            const on = activeClasses.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => onToggleClass(value)}
                aria-pressed={on}
                title={`${count.toLocaleString()} hotels`}
                className={`transition-base inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
                  on
                    ? "bg-[hsl(var(--accent)/0.10)] text-accent ring-[hsl(var(--accent)/0.30)]"
                    : "bg-muted text-muted-foreground ring-border hover:text-foreground"
                }`}
              >
                {value}
                <span className="font-mono tabular-nums text-subtle">
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {submarketOptions.length > 0 && (
        <div className={classOptions.length > 0 ? "mt-2.5" : ""}>
          <label
            htmlFor="submarket-select"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Submarket
          </label>
          <select
            id="submarket-select"
            value={submarket ?? ""}
            onChange={(e) => onSubmarketChange(e.target.value || null)}
            className="h-8 w-full rounded-lg bg-surface px-2 text-sm text-foreground outline-none ring-1 ring-border transition-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="">All submarkets</option>
            {submarketOptions.map(({ value, count }) => (
              <option key={value} value={value}>
                {value} ({count.toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="mt-2 border-t border-border pt-2 text-meta leading-snug text-subtle">
        Chain-scale &amp; submarket cover branded STR hotels in the set.
      </p>
    </div>
  );
}

export default memo(SegmentFilter);
