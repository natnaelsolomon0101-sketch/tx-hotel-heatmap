"use client";

import { RefObject, memo } from "react";
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
  onExportXls?: () => void;
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

const PCT_CHIP: Record<HotelFeature["properties"]["bucket"], string> = {
  red: "bg-revpar-high-soft text-revpar-high",
  yellow: "bg-revpar-mid-soft text-revpar-mid",
  gray: "bg-revpar-low-soft text-revpar-low",
};

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

function DownloadGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  );
}

type RowProps = {
  feature: HotelFeature;
  active: boolean;
  pct: number | null;
  saved: boolean;
  compared: boolean;
  compareDisabled: boolean;
  compareMax: number;
  onSelect: (f: HotelFeature) => void;
  onToggleCompare?: (f: HotelFeature) => void;
  onToggleSaved?: (key: string) => void;
};

const PropertyRow = memo(function PropertyRow({
  feature,
  active,
  pct,
  saved,
  compared,
  compareDisabled,
  compareMax,
  onSelect,
  onToggleCompare,
  onToggleSaved,
}: RowProps) {
  const p = feature.properties;
  const k = featureKey(feature);
  return (
    <div
      className={`flex w-full items-center gap-2.5 px-3 py-2 transition-base ${
        active
          ? "bg-[hsl(var(--accent)/0.08)] ring-1 ring-inset ring-[hsl(var(--accent)/0.25)]"
          : "hover:bg-muted"
      }`}
    >
      <button
        onClick={() => onSelect(feature)}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface"
          style={{ backgroundColor: BUCKET_COLORS[p.bucket] }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {titleCase(p.name)}
          </span>
          <span className="block truncate text-meta text-muted-foreground">
            {titleCase(p.city)}, {p.state}
            {p.rooms != null ? ` · ${p.rooms} rms` : ""}
          </span>
        </span>
        {pct != null && (
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-meta font-mono font-semibold ${PCT_CHIP[p.bucket]}`}
            title={`Statewide RevPAR percentile: P${pct}`}
          >
            P{pct}
          </span>
        )}
        <span className="shrink-0 text-right">
          <span className="block text-data-sm text-foreground">
            {money(p.revpar)}
          </span>
          <span className="block label-overline text-[9px]">
            RevPAR
          </span>
        </span>
      </button>
      {onToggleCompare && (
        <button
          type="button"
          onClick={() => onToggleCompare(feature)}
          aria-pressed={compared}
          disabled={compareDisabled}
          title={
            compared
              ? "Remove from compare"
              : compareDisabled
              ? `Max ${compareMax} in compare`
              : "Add to compare"
          }
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-base leading-none transition-base ${
            compared
              ? "bg-ink text-surface"
              : "text-subtle hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
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
          className={`shrink-0 rounded-md p-1 transition-base ${
            saved
              ? "text-foreground hover:bg-muted"
              : "text-subtle hover:bg-muted hover:text-foreground"
          }`}
        >
          <BookmarkIcon className="h-4 w-4" filled={saved} />
        </button>
      )}
    </div>
  );
});

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
  onExportXls,
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
    <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface shadow-sm ring-1 ring-border backdrop-blur">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label-overline">Properties</h2>
          <span
            aria-live="polite"
            aria-atomic="true"
            className="text-meta font-mono tabular-nums text-subtle"
          >
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
            className="h-9 w-full rounded-lg bg-surface px-3 text-sm text-foreground outline-none ring-1 ring-border transition-base placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle transition-base hover:text-foreground"
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
            className="h-8 min-w-0 flex-1 rounded-lg bg-surface px-2 text-sm text-muted-foreground outline-none ring-1 ring-border transition-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 text-sm font-medium text-muted-foreground ring-1 ring-border transition-base hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40"
          >
            <DownloadGlyph />
            CSV
          </button>
          {onExportXls && (
            <button
              type="button"
              onClick={onExportXls}
              disabled={total === 0}
              title="Export current list to Excel"
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 text-sm font-medium text-muted-foreground ring-1 ring-border transition-base hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40"
            >
              XLS
            </button>
          )}
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
          <ul className="divide-y divide-border">
            {rows.map((f, i) => {
              const k = featureKey(f);
              const active = k === selectedKey;
              const pctRaw = getPercentile?.(f);
              const pct = pctRaw == null ? null : roundPct(pctRaw);
              const saved = savedKeys?.has(k) ?? false;
              const compared = isCompared?.(k) ?? false;
              const compareDisabled = !compared && compareCount >= compareMax;
              return (
                <li key={k + i}>
                  <PropertyRow
                    feature={f}
                    active={active}
                    pct={pct}
                    saved={saved}
                    compared={compared}
                    compareDisabled={compareDisabled}
                    compareMax={compareMax}
                    onSelect={onSelect}
                    onToggleCompare={onToggleCompare}
                    onToggleSaved={onToggleSaved}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > limit && !query && (
        <div className="border-t border-border px-3 py-2 text-meta text-subtle">
          Showing top {limit} of {total.toLocaleString()} — zoom in or search to
          narrow.
        </div>
      )}
    </div>
  );
}
