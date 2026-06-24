"use client";

import { BUCKET_COLORS, HotelFeature } from "@/lib/types";

type PropertyListProps = {
  rows: HotelFeature[];
  total: number;
  limit: number;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (f: HotelFeature) => void;
  selectedKey: string | null;
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
        <p className="mt-2 text-[11px] text-gray-400">
          Sorted by RevPAR — top performers first.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">
            No properties here. Zoom out, pan, or clear the search.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((f, i) => {
              const p = f.properties;
              const k = featureKey(f);
              const active = k === selectedKey;
              return (
                <li key={k + i}>
                  <button
                    onClick={() => onSelect(f)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                      active ? "bg-gray-100" : "hover:bg-gray-50"
                    }`}
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
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-gray-900">
                        {money(p.revpar)}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                        RevPAR
                      </span>
                    </span>
                  </button>
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
