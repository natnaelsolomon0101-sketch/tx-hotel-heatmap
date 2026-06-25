"use client";

import { memo } from "react";
import { BUCKET_COLORS } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { MarketRow } from "@/lib/markets";
import { exportMarkets } from "@/lib/csv";

type MarketPanelProps = {
  rows: MarketRow[];
  onSelectMarket: (city: string) => void;
};

// Tiny stacked red/yellow/gray share bar — mirrors the RevPAR scale colors.
function ShareBar({ shares }: { shares: MarketRow["shares"] }) {
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {(["red", "yellow", "gray"] as const).map((b) =>
        shares[b] > 0 ? (
          <span
            key={b}
            className="h-full"
            style={{
              width: `${shares[b] * 100}%`,
              backgroundColor: BUCKET_COLORS[b],
            }}
          />
        ) : null
      )}
    </span>
  );
}

function ExportGlyph() {
  return (
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
  );
}

function MarketPanel({ rows, onSelectMarket }: MarketPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface/95 shadow-md ring-1 ring-border backdrop-blur">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Markets
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-subtle">
              {rows.length.toLocaleString()} ranked
            </span>
            <button
              type="button"
              onClick={() => exportMarkets(rows)}
              disabled={rows.length === 0}
              title="Export market stats to CSV"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <ExportGlyph />
              Export
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-subtle">
          Cities ranked by average RevPAR. Tap a market to zoom in.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-subtle">
            No markets meet the minimum size for the current filter.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={r.city}>
                <button
                  type="button"
                  onClick={() => onSelectMarket(r.city)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-base hover:bg-muted"
                >
                  <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-subtle">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {r.city}
                    </span>
                    <span className="mt-1 block">
                      <ShareBar shares={r.shares} />
                    </span>
                    <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                      {r.count.toLocaleString()} hotels
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

export default memo(MarketPanel);
