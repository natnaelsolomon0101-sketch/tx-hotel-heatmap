import { HotelFeature } from "./types";

/**
 * Sorted RevPAR indexes for percentile lookups. Built once from the FULL
 * dataset so ranks are absolute and stable regardless of the current filter.
 *
 *  - `statewide`  — every hotel with a non-null RevPAR, ascending.
 *  - `byCity`     — same, grouped by (lowercased, trimmed) city key.
 *
 * Null RevPARs are excluded entirely; a hotel with no RevPAR has no rank.
 */
export interface RevparIndex {
  statewide: number[];
  byCity: Map<string, number[]>;
}

const ASC = (a: number, b: number) => a - b;

/** Normalize a city string into a stable group key. */
export function cityKey(city: string | null | undefined): string {
  return (city ?? "").trim().toLowerCase();
}

/** Build the sorted RevPAR indexes from a feature collection. */
export function buildRevparIndex(features: HotelFeature[]): RevparIndex {
  const statewide: number[] = [];
  const byCity = new Map<string, number[]>();

  for (const f of features) {
    const v = f.properties.revpar;
    if (v == null || Number.isNaN(v)) continue;
    statewide.push(v);
    const key = cityKey(f.properties.city);
    const arr = byCity.get(key);
    if (arr) arr.push(v);
    else byCity.set(key, [v]);
  }

  statewide.sort(ASC);
  for (const arr of byCity.values()) arr.sort(ASC);

  return { statewide, byCity };
}

/**
 * Percentile rank of `value` within an ascending sorted array, as a 0–100
 * number (rank / (n - 1)). Returns null when the value or array is unusable.
 *
 * Uses the midpoint of equal-value runs so duplicates share a fair rank.
 * A lone element (n === 1) is defined as the 100th percentile (it is the
 * top — and only — property in its group).
 */
export function percentileRank(
  value: number | null,
  sorted: number[]
): number | null {
  if (value == null || Number.isNaN(value) || sorted.length === 0) return null;
  if (sorted.length === 1) return 100;

  // First index with sorted[i] >= value, and first with sorted[i] > value.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const first = lo;

  lo = 0;
  hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const last = lo; // exclusive upper bound of the equal run

  // Midpoint rank of the equal-value run.
  const rank = (first + last - 1) / 2;
  return (rank / (sorted.length - 1)) * 100;
}

/** Round a percentile to a whole number for display, clamped to 0–100. */
export function roundPct(p: number): number {
  return Math.max(0, Math.min(100, Math.round(p)));
}

/**
 * Short human descriptor for a percentile (e.g. "Top 10%", "Below median").
 * Returns null for the middle band where no label adds signal.
 */
export function percentileDescriptor(p: number): string | null {
  const r = roundPct(p);
  if (r >= 90) return `Top ${Math.max(1, 100 - r)}%`;
  if (r >= 75) return "Upper quartile";
  if (r >= 50) return "Above median";
  if (r >= 25) return "Below median";
  return "Bottom quartile";
}

/**
 * Resolve both ranks for a single hotel against the prebuilt index.
 * `cityCount` is the size of the hotel's city group (for the "only property
 * in city" edge case). `inCity` is null when RevPAR is missing.
 */
export interface HotelPercentiles {
  statewide: number | null;
  inCity: number | null;
  cityCount: number;
}

export function getHotelPercentiles(
  revpar: number | null,
  city: string | null | undefined,
  index: RevparIndex
): HotelPercentiles {
  const cityArr = index.byCity.get(cityKey(city)) ?? [];
  return {
    statewide: percentileRank(revpar, index.statewide),
    inCity: percentileRank(revpar, cityArr),
    cityCount: cityArr.length,
  };
}
