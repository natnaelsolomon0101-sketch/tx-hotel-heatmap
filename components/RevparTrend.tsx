"use client";

import { memo, useMemo } from "react";

import { TrendPoint } from "@/lib/types";

type RevparTrendProps = {
  history?: TrendPoint[];
  t12Revenue?: number | null;
  t12Revpar?: number | null;
};

const W = 288;
const H = 60;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;

/** $26.0M / $850K / $640 — compact money for headline stats. */
function compactMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function money0(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

/** "2024Q2" → "’24 Q2", "2023" → "2023". */
function qLabel(q: string): string {
  if (/^\d{4}$/.test(q)) return q;
  const m = q.match(/^(\d{4})Q(\d)$/);
  return m ? `’${m[1].slice(2)} Q${m[2]}` : q;
}

function RevparTrend({
  history,
  t12Revenue,
  t12Revpar,
}: RevparTrendProps) {
  const chart = useMemo(() => {
    const pts = (history ?? []).filter(
      (p): p is TrendPoint & { revpar: number } =>
        p.revpar != null && Number.isFinite(p.revpar),
    );

    if (pts.length < 2) {
      return { ready: false as const, pts };
    }

    const vals = pts.map((p) => p.revpar);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;

    const x = (i: number) =>
      PAD_X + (i * (W - 2 * PAD_X)) / Math.max(pts.length - 1, 1);
    const y = (v: number) =>
      PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP - PAD_BOTTOM);

    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.revpar).toFixed(1)}`)
      .join(" ");
    const areaPath =
      `M${x(0).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} ` +
      pts.map((p, i) => `L${x(i).toFixed(1)} ${y(p.revpar).toFixed(1)}`).join(" ") +
      ` L${x(pts.length - 1).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`;

    const last = pts[pts.length - 1];
    const first = pts[0];
    const deltaPct =
      first.revpar > 0 ? ((last.revpar - first.revpar) / first.revpar) * 100 : 0;
    const up = last.revpar >= first.revpar;

    return {
      ready: true as const,
      pts,
      x,
      y,
      linePath,
      areaPath,
      last,
      first,
      deltaPct,
      up,
    };
  }, [history]);

  if (!chart.ready) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <div className="label-overline">
          RevPAR trend
        </div>
        <div className="mt-1 text-meta text-subtle">
          Not enough history reported for this property.
        </div>
      </div>
    );
  }

  const { pts, x, y, linePath, areaPath, last, first, deltaPct, up } = chart;

  const trendLabel = `RevPAR trend, ${qLabel(first.q)} to ${qLabel(last.q)}: ${
    up ? "up" : "down"
  } ${Math.abs(deltaPct).toFixed(0)} percent, ${money0(first.revpar)} to ${money0(
    last.revpar,
  )}`;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-baseline justify-between">
        <div className="label-overline">
          RevPAR trend · {qLabel(first.q)}→{qLabel(last.q)}
        </div>
        <div
          className={`text-[11px] font-semibold font-mono tabular-nums ${
            up ? "text-positive" : "text-negative"
          }`}
        >
          {up ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={trendLabel}
      >
        <defs>
          <linearGradient id="revpar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revpar-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          return (
            <circle
              key={p.q}
              cx={x(i)}
              cy={y(p.revpar)}
              r={isLast ? 3 : p.annual ? 2.6 : 1.9}
              fill={
                p.partial
                  ? "hsl(var(--surface))"
                  : isLast
                    ? "hsl(var(--accent))"
                    : "hsl(var(--accent) / 0.55)"
              }
              stroke={
                p.partial
                  ? "hsl(var(--accent))"
                  : isLast
                    ? "hsl(var(--accent-hover))"
                    : "none"
              }
              strokeWidth={p.partial ? 1.4 : isLast ? 1 : 0}
            >
              <title>
                {qLabel(p.q)}
                {p.annual ? " (full year)" : ""}
                {p.partial ? " (partial)" : ""}: {money0(p.revpar)} RevPAR ·{" "}
                {compactMoney(p.revenue)} revenue
              </title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-subtle">
        <span>{qLabel(first.q)}</span>
        {pts.length > 2 && <span>{qLabel(pts[Math.floor(pts.length / 2)].q)}</span>}
        <span>{qLabel(last.q)}</span>
      </div>

      <div className="mt-3 flex gap-3 rounded-lg bg-muted px-3 py-2 ring-1 ring-border">
        <div className="flex-1">
          <div className="label-overline">
            T12 Revenue
          </div>
          <div className="text-data text-foreground">
            {compactMoney(t12Revenue)}
          </div>
        </div>
        <div className="flex-1">
          <div className="label-overline">
            T12 RevPAR
            <span className="ml-1 font-normal normal-case text-subtle">
              /night
            </span>
          </div>
          <div className="text-data text-foreground">
            {money0(t12Revpar)}
          </div>
        </div>
      </div>
      {!t12Revenue && (
        <div className="mt-1 text-[10px] text-subtle">
          T12 needs four complete quarters; not all were reported for this property.
        </div>
      )}
    </div>
  );
}

export default memo(RevparTrend);
