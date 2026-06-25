"use client";

import { memo, useCallback, useMemo } from "react";
import { BUCKET_COLORS, HotelFeature } from "@/lib/types";
import { featureKey } from "./PropertyList";
import { downloadCsv } from "@/lib/csv";
import { money, int, titleCase } from "@/lib/format";
import EmptyState from "./EmptyState";
import { BookmarkIcon } from "./icons";

type WatchlistViewProps = {
  /** Full feature set; saved hotels are resolved out of this by key. */
  features: HotelFeature[];
  /** Saved feature keys. */
  ids: Set<string>;
  /** Fly to + select a saved hotel. */
  onSelect: (f: HotelFeature) => void;
  /** Remove a single key from the watchlist. */
  onRemove: (key: string) => void;
  /** Empty the entire watchlist. */
  onClear: () => void;
  /** Currently selected feature key, for row highlight. */
  selectedKey: string | null;
};

function ExportGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  );
}

function WatchlistView({
  features,
  ids,
  onSelect,
  onRemove,
  onClear,
  selectedKey,
}: WatchlistViewProps) {
  // Resolve saved keys against current data; stale keys (no longer in the
  // dataset) are skipped silently.
  const saved = useMemo(() => {
    if (ids.size === 0) return [];
    return features.filter((f) => ids.has(featureKey(f)));
  }, [features, ids]);

  const exportWatchlist = useCallback(
    () => downloadCsv(saved, `tx-hotels-watchlist-${saved.length}.csv`),
    [saved]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface/95 shadow-md ring-1 ring-border backdrop-blur">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Saved
          </h2>
          <span className="text-[11px] tabular-nums text-subtle">
            {int(saved.length)} saved
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportWatchlist}
            disabled={saved.length === 0}
            title="Export watchlist to CSV"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ExportGlyph />
            Export watchlist CSV
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={saved.length === 0}
            title="Remove all saved properties"
            className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {saved.length === 0 ? (
          <EmptyState
            title="No saved properties"
            message="Tap the bookmark on any property to save it here for later — your list persists across sessions."
          />
        ) : (
          <ul className="divide-y divide-border">
            {saved.map((f, i) => {
              const p = f.properties;
              const k = featureKey(f);
              const active = k === selectedKey;
              return (
                <li key={k + i}>
                  <div
                    className={`flex w-full items-center gap-2.5 px-3 py-2 transition-base ${
                      active ? "bg-muted" : "hover:bg-muted"
                    }`}
                  >
                    <button
                      onClick={() => onSelect(f)}
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
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {titleCase(p.city)}, {p.state}
                          {p.rooms != null ? ` · ${p.rooms} rms` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-foreground">
                          {money(p.revpar)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-subtle">
                          RevPAR
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(k)}
                      aria-label="Remove from watchlist"
                      title="Remove from watchlist"
                      className="shrink-0 rounded-md p-1 text-foreground hover:bg-muted"
                    >
                      <BookmarkIcon className="h-4 w-4" filled />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(WatchlistView);
