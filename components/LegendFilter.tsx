"use client";

import { Bucket } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";

type LegendFilterProps = {
  active: Set<Bucket>;
  counts: Record<Bucket, number>;
  onToggle: (b: Bucket) => void;
  onReset: () => void;
  layerMode: "pins" | "heatmap";
  /** [yellow≥, red≥] RevPAR dollar cutoffs, shown next to each tier. */
  revparCutoffs?: [number, number];
};

const ROWS: {
  bucket: Bucket;
  title: string;
  sub: string;
  swatch: string;
  soft: string;
}[] = [
  {
    bucket: "red",
    title: "High RevPAR",
    sub: "Top third of portfolio",
    swatch: "bg-revpar-high",
    soft: "bg-revpar-high-soft text-revpar-high ring-revpar-high",
  },
  {
    bucket: "yellow",
    title: "Mid RevPAR",
    sub: "Middle third",
    swatch: "bg-revpar-mid",
    soft: "bg-revpar-mid-soft text-revpar-mid ring-revpar-mid",
  },
  {
    bucket: "gray",
    title: "Low / no data",
    sub: "Bottom third + missing",
    swatch: "bg-revpar-low",
    soft: "bg-revpar-low-soft text-revpar-low ring-revpar-low",
  },
];

export default function LegendFilter({
  active,
  counts,
  onToggle,
  onReset,
  layerMode,
  revparCutoffs,
}: LegendFilterProps) {
  const allOn = active.size === 3;
  // Per-tier dollar hint: red ≥ cutoffs[1], yellow ≥ cutoffs[0].
  const tierCutoff: Record<Bucket, string | null> = {
    red: revparCutoffs ? `${fmtMoney(revparCutoffs[1])}+` : null,
    yellow: revparCutoffs ? `${fmtMoney(revparCutoffs[0])}+` : null,
    gray: null,
  };
  return (
    <div className="shrink-0 rounded-panel bg-surface p-2.5 shadow-sm ring-1 ring-border md:p-3">
      <div className="mb-1.5 flex items-center justify-between md:mb-2">
        <h2 className="label-overline">RevPAR scale</h2>
        <button
          type="button"
          onClick={onReset}
          className={`text-xs font-medium transition-base ${
            allOn
              ? "text-subtle"
              : "text-accent hover:text-[hsl(var(--accent-hover))]"
          }`}
          disabled={allOn}
        >
          Show all
        </button>
      </div>

      {/* Compact horizontal chips on mobile so the property list keeps room. */}
      <div className="flex gap-1.5 md:hidden">
        {ROWS.map(({ bucket, title, soft }) => {
          const on = active.has(bucket);
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onToggle(bucket)}
              className={`flex flex-1 items-center gap-1.5 rounded-full px-2 py-1.5 text-left transition-base ${soft} ${
                on ? "ring-1 opacity-100" : "ring-0 opacity-50"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium leading-tight">
                  {title.replace(" RevPAR", "")}
                </span>
                <span className="block text-[11px] font-mono tabular-nums leading-tight text-subtle">
                  {counts[bucket].toLocaleString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Detailed vertical legend on desktop. */}
      <div className="hidden flex-col gap-1 md:flex">
        {ROWS.map(({ bucket, title, sub, swatch }) => {
          const on = active.has(bucket);
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onToggle(bucket)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-base ${
                on ? "hover:bg-muted" : "opacity-40 hover:opacity-70"
              }`}
            >
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-surface ${swatch}`}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {title}
                  {tierCutoff[bucket] && (
                    <span className="ml-1 text-[11px] font-normal text-subtle">
                      {tierCutoff[bucket]}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {sub}
                </span>
              </span>
              <span className="text-xs font-mono tabular-nums text-subtle">
                {counts[bucket].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 hidden border-t border-border pt-2 text-meta leading-snug text-subtle md:block">
        {layerMode === "heatmap"
          ? "Heatmap intensity is weighted by RevPAR. Tap a row to filter."
          : "Tap a row to filter the map. RevPAR = period room revenue ÷ available rooms."}
      </p>
    </div>
  );
}
