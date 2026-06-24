"use client";

import { RefObject } from "react";
import { BUCKET_COLORS, HotelFeature } from "@/lib/types";
import { roundPct } from "@/lib/percentile";
import EmptyState from "@/components/EmptyState";
import { BookmarkIcon } from "@/components/icons";

export type SortKey = "revpar-desc" | "revpar-asc" | "rooms-desc" | "name-asc";

const SORT_LABELS: Record<SortKey, string> = {
  "revpar-desc": "RevPAR: high → low",
  "revpar-asc": "RevPAR: low → high",
  "rooms-desc": "Rooms: most first",
  "name-asc": "Name: A → Z",
};

type PropertyListProps = {
  rows: HotelFeature[];
  total: number;
  limit: number;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (f: HotelFeature) => void;
  selectedKey: string | null;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onExport: () => void;
  searchInputRef?: RefObject<HTMLInputElement>;
  onClear?: () => void;
  hasFilters?: boolean;
  isCompared?: (key: string) => boolean;
  onToggleCompare?: (f: HotelFeature) => void;
  compareMax?: number;
  compareCount?: number;
  /** Statewide RevPAR percentile (0–100) for a row, or null when unranked. */
  getPercentile?: (f: HotelFeature) => number | null;
  /** Saved feature keys; when provided, rows show a bookmark toggle. */
  savedKeys?: Set<string>;
  /** Toggle a feature's watchlist membership by key. */
  onToggleSaved?: (key: string) => void;
};

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

const money = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });

export function featureKey(f: HotelFeature) {
  const [lng, lat] = f.geometry.coordinates;
  return `${f.properties.name}|${lng.toFixed(4)},${lat.toFixed(4)}`;
}

export default function PropertyList({
  rows,
  total,
  limit,
  query,
  onQuery,
  onSelect,
  selectedKey,
  sort,
  onSort,
  onExport,
  searchInputRef,
  onClear,
  hasFilters,
  isCompared,
  onToggleCompare,
  compareMax = 3,
  compareCount = 0,
  getPercentile,
  savedKeys,
  onToggleSaved,
}: PropertyListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur">
      <div className="border-b border-gray-100 p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Properties
          </h2>
          <span className="text-[11px] tabular-nums text-gray-400">
            {query
              ? `${total.toLocaleString()} match`
              : `${total.toLocaleString()} in view`}
          </span>
        </div>
        <div className="relative">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search hotel or city…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-400"
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              ×
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            aria-label="Sort properties"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 outline-none focus:border-gray-400"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExport}
            disabled={total === 0}
            title="Export current list to CSV"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            title="No properties match"
            message={
              query
                ? `Nothing matches “${query}” in the current view.`
                : "No hotels here. Zoom out or pan the map."
            }
            onClear={
              hasFilters || query
                ? () => {
                    onQuery("");
                    onClear?.();
                  }
                : undefined
            }
            clearLabel={query && !hasFilters ? "Clear search" : "Clear filters"}
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((f, i) => {
              const p = f.properties;
              const k = featureKey(f);
              const active = k === selectedKey;
              const pctRaw = getPercentile?.(f);
              const pct = pctRaw == null ? null : roundPct(pctRaw);
              const saved = savedKeys?.has(k) ?? false;
              const compared = isCompared?.(k) ?? false;
              const compareDisabled = !compared && compareCount >= compareMax;
              return (
                <li key={k + i}>
                  <div
                    className={`flex w-full items-center gap-2.5 px-3 py-2 transition ${
                      active ? "bg-gray-100" : "hover:bg-gray-50"
                    }`}
                  >
                    <button
                      onClick={() => onSelect(f)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
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
                      {pct != null && (
                        <span
                          className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500"
                          title={`Statewide RevPAR percentile: P${pct}`}
                        >
                          P{pct}
                        </span>
                      )}
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-gray-900">
                          {money(p.revpar)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                          RevPAR
                        </span>
                      </span>
                    </button>
                    {onToggleCompare && (
                      <button
                        type="button"
                        onClick={() => onToggleCompare(f)}
                        aria-pressed={compared}
                        disabled={compareDisabled}
                        title={
                          compared
                            ? "Remove from compare"
                            : compareDisabled
                            ? `Max ${compareMax} in compare`
                            : "Add to compare"
                        }
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-base leading-none transition ${
                          compared
                            ? "bg-gray-900 text-white"
                            : "text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 disabled:hover:bg-transparent"
                        }`}
                      >
                        {compared ? "★" : "✩"}
                      </button>
                    )}
                    {onToggleSaved && (
                      <button
                        type="button"
                        onClick={() => onToggleSaved(k)}
                        aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
                        aria-pressed={saved}
                        title={saved ? "Saved — click to remove" : "Save to watchlist"}
                        className={`shrink-0 rounded-md p-1 transition ${
                          saved
                            ? "text-gray-900 hover:bg-gray-100"
                            : "text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                        }`}
                      >
                        <BookmarkIcon className="h-4 w-4" filled={saved} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > limit && !query && (
        <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
          Showing top {limit} of {total.toLocaleString()} — zoom in or search to
          narrow.
        </div>
      )}
    </div>
  );
}
