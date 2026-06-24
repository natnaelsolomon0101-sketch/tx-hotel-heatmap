"use client";

import { useMemo } from "react";
import { BUCKET_COLORS, BUCKET_LABELS, Bucket, HotelFeature } from "@/lib/types";
import { computeStats, fmtMoney } from "@/lib/stats";

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

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

// Shared summary panel used by both the polygon lasso and the radius tool.
// Self-contained: computes its own portfolio stats over the contained set.
export default function AreaSummary({
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
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur">
      <div className="border-b border-gray-100 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
            {label}
          </h2>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] font-medium text-gray-500 hover:text-gray-900"
          >
            Clear
          </button>
        </div>
        {detail && (
          <p className="mt-1 truncate text-[11px] tabular-nums text-gray-400">
            {detail}
          </p>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No hotels inside</p>
          <p className="text-[11px] leading-snug text-gray-400">
            Draw over a denser area, or adjust your filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px border-b border-gray-100 bg-gray-100">
            <Metric label="Hotels" value={total.toLocaleString()} />
            <Metric label="Avg RevPAR" value={fmtMoney(stats.avgRevpar)} />
            <Metric label="Median" value={fmtMoney(stats.medianRevpar)} />
          </div>

          <div className="border-b border-gray-100 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                RevPAR mix
              </span>
              <span className="text-[11px] tabular-nums text-gray-400">
                {stats.withRevpar.toLocaleString()} with data
              </span>
            </div>
            <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
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
                  className="flex items-center gap-1 text-[11px] tabular-nums text-gray-500"
                  title={BUCKET_LABELS[b]}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: BUCKET_COLORS[b] }}
                  />
                  {stats.buckets[b].toLocaleString()}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Top by RevPAR
            </div>
            {top.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-gray-400">
                No RevPAR data for hotels in this area.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {top.map((f, i) => {
                  const p = f.properties;
                  return (
                    <li
                      key={`${p.name}-${i}`}
                      className="flex items-center gap-2.5 px-3 py-2"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: BUCKET_COLORS[p.bucket] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {titleCase(p.name)}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500">
                          {titleCase(p.city)}, {p.state}
                          {p.rooms != null ? ` · ${p.rooms} rms` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
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

      <div className="flex gap-2 border-t border-gray-100 p-3">
        <button
          type="button"
          onClick={onExport}
          disabled={total === 0}
          title="Export hotels in this area to CSV"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg
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
          className="flex-1 rounded-lg bg-gray-900 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-gray-700"
        >
          Clear area
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-3 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-gray-900">
        {value}
      </span>
    </div>
  );
}
