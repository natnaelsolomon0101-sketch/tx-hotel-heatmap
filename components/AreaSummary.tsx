"use client";

import { memo, useMemo } from "react";
import { BUCKET_COLORS, BUCKET_LABELS, Bucket, HotelFeature } from "@/lib/types";
import { computeStats, fmtMoney } from "@/lib/stats";
import { titleCase } from "@/lib/format";
import EmptyState from "@/components/EmptyState";

type AreaSummaryProps = {
  /** Human label for the drawn area, e.g. "Drawn area" or "3 mi radius". */
  label: string;
  /** Optional secondary detail, e.g. "5 vertices · ~12 sq mi". */
  detail?: string;
  /** Hotels contained by the area (already filtered to the current scope). */
  features: HotelFeature[];
  onExport: () => void;
  onClear: () => void;
};

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

// Shared summary panel used by both the polygon lasso and the radius tool.
// Self-contained: computes its own portfolio stats over the contained set.
function AreaSummary({
  label,
  detail,
  features,
  onExport,
  onClear,
}: AreaSummaryProps) {
  const stats = useMemo(() => computeStats(features), [features]);
  const top = useMemo(
    () =>
      [...features]
        .filter((f) => f.properties.revpar != null)
        .sort(
          (a, b) =>
            (b.properties.revpar ?? -1) - (a.properties.revpar ?? -1)
        )
        .slice(0, 5),
    [features]
  );

  const total = stats.total;
  const totalBuckets =
    stats.buckets.red + stats.buckets.yellow + stats.buckets.gray || 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface/95 shadow-card ring-1 ring-border backdrop-blur">
      <div className="border-b border-border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h2>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        {detail && (
          <p className="mt-1 truncate text-[11px] tabular-nums text-subtle">
            {detail}
          </p>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="No hotels inside"
            message="Draw over a denser area, or loosen your filters."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px border-b border-border bg-muted">
            <Metric label="Hotels" value={total.toLocaleString()} />
            <Metric label="Avg RevPAR" value={fmtMoney(stats.avgRevpar)} />
            <Metric label="Median" value={fmtMoney(stats.medianRevpar)} />
          </div>

          <div className="border-b border-border p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">
                RevPAR mix
              </span>
              <span className="text-[11px] tabular-nums text-subtle">
                {stats.withRevpar.toLocaleString()} with data
              </span>
            </div>
            <span
              role="img"
              aria-label={`RevPAR mix: ${stats.buckets.red.toLocaleString()} high, ${stats.buckets.yellow.toLocaleString()} mid, ${stats.buckets.gray.toLocaleString()} low or no data`}
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {ALL_BUCKETS.map((b) =>
                stats.buckets[b] > 0 ? (
                  <span
                    key={b}
                    className="h-full"
                    style={{
                      width: `${(stats.buckets[b] / totalBuckets) * 100}%`,
                      backgroundColor: BUCKET_COLORS[b],
                    }}
                  />
                ) : null
              )}
            </span>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {ALL_BUCKETS.map((b) => (
                <span
                  key={b}
                  className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground"
                  title={BUCKET_LABELS[b]}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: BUCKET_COLORS[b] }}
                  />
                  {stats.buckets[b].toLocaleString()}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-subtle">
              Top by RevPAR
            </div>
            {top.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-subtle">
                No RevPAR data for hotels in this area.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {top.map((f, i) => {
                  const p = f.properties;
                  return (
                    <li
                      key={`${p.name}-${i}`}
                      className="flex items-center gap-2.5 px-3 py-2"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface"
                        style={{ backgroundColor: BUCKET_COLORS[p.bucket] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {titleCase(p.name)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {titleCase(p.city)}, {p.state}
                          {p.rooms != null ? ` · ${p.rooms} rms` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {fmtMoney(p.revpar)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="flex gap-2 border-t border-border p-3">
        <button
          type="button"
          onClick={onExport}
          disabled={total === 0}
          title="Export hotels in this area to CSV"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
          </svg>
          Export CSV
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex-1 rounded-lg bg-ink px-2 py-1.5 text-[11px] font-medium text-white hover:bg-ink-hover"
        >
          Clear area
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-3 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export default memo(AreaSummary);
