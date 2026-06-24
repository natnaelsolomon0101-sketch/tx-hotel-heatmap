/**
 * Pure, dependency-free chart helpers for the Analytics dashboard. All SVG
 * rendering lives in components/AnalyticsPanel.tsx; this module only does the
 * math so it can be unit-reasoned and reused.
 */

export interface HistBin {
  x0: number; // inclusive lower edge
  x1: number; // exclusive upper edge (Infinity for the open top bin)
  count: number;
  label: string; // short axis label, e.g. "100" or "4k+"
}

/**
 * Fixed-edge histogram tuned to the RevPAR spread ($3–$4000): most mass sits
 * under $100 while a long tail runs to a few thousand. Passing explicit edges
 * lets the caller use log-friendly buckets instead of uniform-width bins.
 *
 * Each bin counts values in [x0, x1). The final bin is open-ended (x1 = ∞) so
 * the largest outliers always land somewhere. Values below the first edge fall
 * into the first bin.
 */
export function histogram(
  values: number[],
  edges: number[] = DEFAULT_REVPAR_EDGES
): HistBin[] {
  const sorted = [...edges].sort((a, b) => a - b);
  const bins: HistBin[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const x0 = sorted[i];
    const x1 = i + 1 < sorted.length ? sorted[i + 1] : Infinity;
    bins.push({ x0, x1, count: 0, label: edgeLabel(x0, x1) });
  }
  if (bins.length === 0) return bins;

  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue;
    // Linear scan is fine: edge count is tiny (~10) and far cheaper than the
    // branch overhead of a binary search at this size.
    let placed = bins.length - 1;
    for (let i = 0; i < bins.length; i++) {
      if (v < bins[i].x1) {
        placed = i;
        break;
      }
    }
    bins[placed].count += 1;
  }
  return bins;
}

/** Log-friendly RevPAR bucket edges (dollars). */
export const DEFAULT_REVPAR_EDGES = [
  0, 25, 50, 75, 100, 150, 250, 500, 1000, 2000, 4000,
];

function edgeLabel(x0: number, x1: number): string {
  if (x1 === Infinity) return `${short(x0)}+`;
  return short(x0);
}

function short(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(n);
}

/**
 * Round, human-friendly tick values from 0..max with roughly `count` steps.
 * Steps snap to 1/2/5 × 10^n so axis labels read cleanly.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0];
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.5; t += step) {
    ticks.push(Math.round(t));
  }
  return ticks;
}
