"use client";

import { Bucket, BUCKET_COLORS } from "@/lib/types";

type LegendFilterProps = {
  active: Set<Bucket>;
  counts: Record<Bucket, number>;
  onToggle: (b: Bucket) => void;
  onReset: () => void;
  layerMode: "pins" | "heatmap";
};

const ROWS: { bucket: Bucket; title: string; sub: string }[] = [
  { bucket: "red", title: "High RevPAR", sub: "Top third of portfolio" },
  { bucket: "yellow", title: "Mid RevPAR", sub: "Middle third" },
  { bucket: "gray", title: "Low / no data", sub: "Bottom third + missing" },
];

export default function LegendFilter({
  active,
  counts,
  onToggle,
  onReset,
  layerMode,
}: LegendFilterProps) {
  const allOn = active.size === 3;
  return (
    <div className="shrink-0 rounded-2xl bg-white/95 p-2.5 shadow-card ring-1 ring-black/5 backdrop-blur md:p-3">
      <div className="mb-1.5 flex items-center justify-between md:mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          RevPAR scale
        </h2>
        <button
          type="button"
          onClick={onReset}
          className={`text-xs font-medium ${
            allOn ? "text-gray-300" : "text-blue-600 hover:underline"
          }`}
          disabled={allOn}
        >
          Show all
        </button>
      </div>

      {/* Compact horizontal chips on mobile so the property list keeps room. */}
      <div className="flex gap-1.5 md:hidden">
        {ROWS.map(({ bucket, title }) => {
          const on = active.has(bucket);
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onToggle(bucket)}
              className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition ${
                on
                  ? "border-gray-200 bg-white"
                  : "border-transparent bg-gray-50 opacity-50"
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: BUCKET_COLORS[bucket] }}
              />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium leading-tight text-gray-700">
                  {title.replace(" RevPAR", "")}
                </span>
                <span className="block text-[11px] tabular-nums leading-tight text-gray-400">
                  {counts[bucket].toLocaleString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Detailed vertical legend on desktop. */}
      <div className="hidden flex-col gap-1 md:flex">
        {ROWS.map(({ bucket, title, sub }) => {
          const on = active.has(bucket);
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onToggle(bucket)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                on ? "hover:bg-gray-100" : "opacity-40 hover:opacity-70"
              }`}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: BUCKET_COLORS[bucket] }}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-gray-800">
                  {title}
                </span>
                <span className="block text-[11px] text-gray-500">{sub}</span>
              </span>
              <span className="text-xs tabular-nums text-gray-400">
                {counts[bucket].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 hidden border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400 md:block">
        {layerMode === "heatmap"
          ? "Heatmap intensity is weighted by RevPAR. Tap a row to filter."
          : "Tap a row to filter the map. RevPAR = period room revenue ÷ available rooms."}
      </p>
    </div>
  );
}
