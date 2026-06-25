"use client";

import { memo, useMemo } from "react";
import { BUCKET_COLORS, BUCKET_LABELS, HotelFeature } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { featureKey } from "./PropertyList";
import { CloseIcon } from "./icons";

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

const pct = (n: number | null): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
};

/**
 * RevPAR percentile rank of `value` against a pre-sorted ascending list of all
 * known RevPARs. 99 = top of the dataset, 1 = bottom. Returns null when no
 * RevPAR or no reference data. Self-contained so the tray needs no extra deps.
 */
function revparPercentile(
  value: number | null,
  sortedRevpars: number[]
): number | null {
  if (value == null || sortedRevpars.length === 0) return null;
  // Count strictly-below + half of ties (mid-rank), classic percentile.
  let below = 0;
  let equal = 0;
  for (const r of sortedRevpars) {
    if (r < value) below += 1;
    else if (r === value) equal += 1;
    else break; // sorted ascending — nothing larger matters
  }
  const rank = (below + equal / 2) / sortedRevpars.length;
  return Math.max(1, Math.min(99, Math.round(rank * 100)));
}

function FlyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

type MetricRow = {
  label: string;
  /** Display string per card (index-aligned with `items`). */
  values: string[];
  /** Numeric value per card for best-of highlighting; null when not comparable. */
  nums: (number | null)[];
};

type CompareTrayProps = {
  items: HotelFeature[];
  /** All RevPARs in the dataset, sorted ascending, for percentile ranking. */
  sortedRevpars: number[];
  onRemove: (key: string) => void;
  onClear: () => void;
  onFlyTo: (f: HotelFeature) => void;
  max?: number;
};

function CompareTray({
  items,
  sortedRevpars,
  onRemove,
  onClear,
  onFlyTo,
  max = 3,
}: CompareTrayProps) {
  const percentiles = useMemo(
    () => items.map((f) => revparPercentile(f.properties.revpar, sortedRevpars)),
    [items, sortedRevpars]
  );

  // Build comparable metric rows. `nums` drives best-of highlighting (max wins).
  const rows = useMemo<MetricRow[]>(
    () => [
      {
        label: "RevPAR",
        values: items.map((f) => fmtMoney(f.properties.revpar)),
        nums: items.map((f) => f.properties.revpar),
      },
      {
        label: "Rank",
        values: percentiles.map((p) => (p == null ? "—" : `${p}th pct`)),
        nums: percentiles,
      },
      {
        label: "Rooms",
        values: items.map((f) =>
          f.properties.rooms != null ? f.properties.rooms.toLocaleString() : "—"
        ),
        nums: items.map((f) => f.properties.rooms),
      },
      {
        label: "Revenue",
        values: items.map((f) => fmtMoney(f.properties.revenue)),
        nums: items.map((f) => f.properties.revenue),
      },
      {
        label: "ADR",
        values: items.map((f) => fmtMoney(f.properties.adr)),
        nums: items.map((f) => f.properties.adr),
      },
      {
        label: "Occupancy",
        values: items.map((f) => pct(f.properties.occupancy)),
        nums: items.map((f) => f.properties.occupancy),
      },
    ],
    [items, percentiles]
  );

  // Index of the best (max) value per row; -1 when fewer than 2 real values or
  // a tie at the top (don't crown ties — keeps it honest).
  const bestIdx = useMemo<number[]>(
    () =>
      rows.map((row) => {
        const present = row.nums
          .map((n, i) => ({ n, i }))
          .filter((x) => x.n != null) as { n: number; i: number }[];
        if (present.length < 2) return -1;
        let best = present[0];
        let tie = false;
        for (const x of present.slice(1)) {
          if (x.n > best.n) {
            best = x;
            tie = false;
          } else if (x.n === best.n) {
            tie = true;
          }
        }
        return tie ? -1 : best.i;
      }),
    [rows]
  );

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-2 print:hidden md:bottom-4">
      <div
        role="region"
        aria-label="Hotel comparison"
        className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Compare{" "}
            <span className="tabular-nums text-gray-400">
              ({items.length}/{max})
            </span>
          </h2>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Clear all
          </button>
        </div>

        <div
          className="grid gap-2 p-2"
          style={{
            gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          }}
        >
          {items.map((f, ci) => {
            const p = f.properties;
            return (
              <div
                key={featureKey(f) + ci}
                className="flex flex-col rounded-xl bg-gray-50 ring-1 ring-black/5"
              >
                <div className="flex items-start gap-1.5 border-b border-gray-100 px-2.5 py-2">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: BUCKET_COLORS[p.bucket] }}
                    title={BUCKET_LABELS[p.bucket]}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-gray-900">
                      {titleCase(p.name)}
                    </div>
                    <div className="truncate text-[10px] text-gray-500">
                      {p.city ? titleCase(p.city) : "—"}
                      {p.state ? `, ${p.state}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(featureKey(f))}
                    aria-label={`Remove ${titleCase(p.name)} from compare`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </div>

                <dl className="flex-1 divide-y divide-gray-100">
                  {rows.map((row, ri) => {
                    const isBest = bestIdx[ri] === ci;
                    return (
                      <div
                        key={row.label}
                        className="flex items-center justify-between px-2.5 py-1"
                      >
                        <dt className="text-[10px] uppercase tracking-wide text-gray-400">
                          {row.label}
                        </dt>
                        <dd
                          aria-label={
                            isBest
                              ? `${row.values[ci]}, best ${row.label}`
                              : undefined
                          }
                          className={`tabular-nums text-xs ${
                            isBest
                              ? "rounded-md bg-emerald-50 px-1.5 font-bold text-emerald-700 ring-1 ring-emerald-200"
                              : "font-medium text-gray-800"
                          }`}
                        >
                          {row.values[ci]}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => onFlyTo(f)}
                    aria-label={`Fly to ${titleCase(p.name)}`}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-gray-700"
                  >
                    <FlyIcon />
                    Fly to
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(CompareTray);
