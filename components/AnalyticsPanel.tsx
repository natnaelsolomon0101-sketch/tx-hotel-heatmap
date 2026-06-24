"use client";

import {
  Bucket,
  BUCKET_COLORS,
  BUCKET_LABELS,
  HotelFeature,
} from "@/lib/types";
import { fmtMoney, PortfolioStats } from "@/lib/stats";
import { MarketRow } from "@/lib/markets";
import { histogram, niceTicks } from "@/lib/charts";
import EmptyState from "@/components/EmptyState";

type AnalyticsPanelProps = {
  /** The in-scope hotel set (filtered + in-view / searched). */
  inScope: HotelFeature[];
  /** Portfolio stats for the same set (reused from MapView). */
  stats: PortfolioStats;
  /** Market rows aggregated from the same in-scope set. */
  marketRows: MarketRow[];
  /** Zoom the map to a city (same handler the Markets tab uses). */
  onSelectMarket: (city: string) => void;
};

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// 1. RevPAR distribution histogram (with median marker).
// ---------------------------------------------------------------------------
function RevparHistogram({
  values,
  median,
}: {
  values: number[];
  median: number | null;
}) {
  const bins = histogram(values);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  // viewBox geometry — width is arbitrary; SVG scales to container width.
  const W = 300;
  const H = 120;
  const padL = 4;
  const padR = 4;
  const padTop = 6;
  const padBot = 18; // room for x labels
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBot;
  const n = bins.length;
  const slot = plotW / n;
  const barW = slot * 0.72;
  const ticks = niceTicks(maxCount, 3);

  // Median x-position: find which bin it lands in, then place proportionally.
  let medianX: number | null = null;
  if (median != null) {
    let idx = bins.findIndex((b) => median < b.x1);
    if (idx < 0) idx = bins.length - 1;
    medianX = padL + idx * slot + slot / 2;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="block"
      role="img"
      aria-label="RevPAR distribution histogram"
    >
      {/* gridlines */}
      {ticks.map((t) => {
        const y = padTop + plotH - (t / maxCount) * plotH;
        return (
          <line
            key={t}
            x1={padL}
            x2={W - padR}
            y1={y}
            y2={y}
            stroke="#eceff1"
            strokeWidth={1}
          />
        );
      })}
      {/* bars */}
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * plotH;
        const x = padL + i * slot + (slot - barW) / 2;
        const y = padTop + plotH - h;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, b.count > 0 ? 1 : 0)}
              rx={1.5}
              fill="#94a3b8"
            >
              <title>{`$${b.label} — ${b.count.toLocaleString()} hotels`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={7}
              fill="#9aa0a6"
            >
              {b.label}
            </text>
          </g>
        );
      })}
      {/* median marker */}
      {medianX != null && (
        <g>
          <line
            x1={medianX}
            x2={medianX}
            y1={padTop - 2}
            y2={padTop + plotH}
            stroke="#111827"
            strokeWidth={1.25}
            strokeDasharray="3 2"
          />
          <text
            x={Math.min(medianX + 3, W - 40)}
            y={padTop + 6}
            fontSize={7.5}
            fontWeight={600}
            fill="#111827"
          >
            {`med ${fmtMoney(median)}`}
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Bucket breakdown — horizontal stacked bar + legend with counts/%.
// ---------------------------------------------------------------------------
function BucketBreakdown({ buckets }: { buckets: Record<Bucket, number> }) {
  const total = ALL_BUCKETS.reduce((s, b) => s + buckets[b], 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <span className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {ALL_BUCKETS.map((b) =>
          buckets[b] > 0 ? (
            <span
              key={b}
              className="h-full"
              style={{
                width: `${pct(buckets[b])}%`,
                backgroundColor: BUCKET_COLORS[b],
              }}
            />
          ) : null
        )}
      </span>
      <ul className="mt-2 space-y-1">
        {ALL_BUCKETS.map((b) => (
          <li
            key={b}
            className="flex items-center gap-2 text-[11px] text-gray-600"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: BUCKET_COLORS[b] }}
            />
            <span className="min-w-0 flex-1 truncate">{BUCKET_LABELS[b]}</span>
            <span className="shrink-0 tabular-nums text-gray-800">
              {buckets[b].toLocaleString()}
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-gray-400">
              {pct(buckets[b]).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Top markets by avg RevPAR — clickable horizontal bars.
// ---------------------------------------------------------------------------
function TopMarkets({
  rows,
  onSelectMarket,
}: {
  rows: MarketRow[];
  onSelectMarket: (city: string) => void;
}) {
  const top = rows.slice(0, 8);
  const maxAvg = Math.max(1, ...top.map((r) => r.avgRevpar));

  if (top.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-gray-400">
        No markets meet the minimum size for the current selection.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {top.map((r) => {
        const w = (r.avgRevpar / maxAvg) * 100;
        return (
          <li key={r.city}>
            <button
              type="button"
              onClick={() => onSelectMarket(r.city)}
              title={`Zoom to ${r.city}`}
              className="group block w-full text-left"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-medium text-gray-700 group-hover:text-gray-900">
                  {r.city}
                </span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-900">
                  {fmtMoney(r.avgRevpar)}
                </span>
              </span>
              <span className="mt-0.5 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <span
                  className="h-full rounded-full bg-gray-400 transition-colors group-hover:bg-gray-900"
                  style={{ width: `${Math.max(w, 2)}%` }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function AnalyticsPanel({
  inScope,
  stats,
  marketRows,
  onSelectMarket,
}: AnalyticsPanelProps) {
  const revpars = inScope
    .map((f) => f.properties.revpar)
    .filter((v): v is number => v != null);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/95 shadow-card ring-1 ring-black/5 backdrop-blur">
      <div className="border-b border-gray-100 p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Analytics
          </h2>
          <span className="text-[11px] tabular-nums text-gray-400">
            {stats.total.toLocaleString()} in view
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-gray-400">
          {stats.total.toLocaleString()} hotels in view ·{" "}
          {stats.withRevpar.toLocaleString()} with RevPAR data
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {stats.total === 0 ? (
          <EmptyState
            title="Nothing to chart"
            message="No hotels in the current view. Zoom out, pan the map, or loosen your filters."
          />
        ) : (
          <div className="space-y-5 p-3">
            <section>
              <SectionHeading>RevPAR distribution</SectionHeading>
              {revpars.length === 0 ? (
                <p className="text-[11px] leading-snug text-gray-400">
                  No RevPAR data in the current selection.
                </p>
              ) : (
                <RevparHistogram
                  values={revpars}
                  median={stats.medianRevpar}
                />
              )}
            </section>

            <section>
              <SectionHeading>Bucket breakdown</SectionHeading>
              <BucketBreakdown buckets={stats.buckets} />
            </section>

            <section>
              <SectionHeading>Top markets by avg RevPAR</SectionHeading>
              <TopMarkets rows={marketRows} onSelectMarket={onSelectMarket} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
