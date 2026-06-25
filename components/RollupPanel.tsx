"use client";

import { memo, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/stats";
import { RollupRow } from "@/lib/markets";
import { RollupDim, RollupSort, sortRollup } from "@/lib/rollups";
import ShareBar from "@/components/ShareBar";

type RollupPanelProps = {
  /** Pre-aggregated rows for the active dimension (avg-RevPAR-desc from lib). */
  rows: RollupRow[];
  /** Which dimension the rows represent — drives labels + select callback. */
  dim: RollupDim;
  onDimChange: (dim: RollupDim) => void;
  /** Called with the row key (a ZIP string or a city name) on row click. */
  onSelect: (dim: RollupDim, key: string) => void;
};

// Segmented two-option toggle (ZIP | City, or Avg | Count), styled to match the
// right-column tab row in MapView.
function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-base ${
            value === id
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RollupPanel({
  rows,
  dim,
  onDimChange,
  onSelect,
}: RollupPanelProps) {
  const [sort, setSort] = useState<RollupSort>("avg");
  const sorted = useMemo(() => sortRollup(rows, sort), [rows, sort]);

  const dimLabel = dim === "zip" ? "ZIP codes" : "Cities";

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface/95 shadow-md ring-1 ring-border backdrop-blur">
      <div className="border-b border-border p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Rollups
          </h2>
          <span className="text-[11px] tabular-nums text-subtle">
            {sorted.length.toLocaleString()} ranked
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-subtle">
          {dimLabel} aggregated from the current filter. Tap a row to filter the
          list and fly there.
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Segmented<RollupDim>
            ariaLabel="Group by"
            value={dim}
            options={[
              ["zip", "ZIP"],
              ["city", "City"],
            ]}
            onChange={onDimChange}
          />
          <Segmented<RollupSort>
            ariaLabel="Sort by"
            value={sort}
            options={[
              ["avg", "Avg RevPAR"],
              ["count", "Count"],
            ]}
            onChange={setSort}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-subtle">
            No {dim === "zip" ? "ZIP codes" : "cities"} meet the minimum size for
            the current filter.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((r, i) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onSelect(dim, r.key)}
                  aria-label={`Rank ${i + 1}: ${r.key}, ${r.count.toLocaleString()} hotels, average RevPAR ${fmtMoney(r.avgRevpar)}, median ${fmtMoney(r.medianRevpar)}. Filter to this ${dim === "zip" ? "ZIP code" : "city"}.`}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-base hover:bg-muted"
                >
                  <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-subtle">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {r.key}
                    </span>
                    <span className="mt-1 block">
                      <ShareBar shares={r.shares} />
                    </span>
                    <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                      {r.count.toLocaleString()} hotels · med{" "}
                      {fmtMoney(r.medianRevpar)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-foreground">
                      {fmtMoney(r.avgRevpar)}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wide text-subtle">
                      Avg RevPAR
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(RollupPanel);
