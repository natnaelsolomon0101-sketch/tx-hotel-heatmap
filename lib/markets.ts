import { Bucket, HotelFeature } from "./types";

/** A generic area-level rollup row (city, ZIP, or any other key). */
export interface RollupRow {
  key: string;
  count: number;
  avgRevpar: number;
  medianRevpar: number;
  redShare: number; // 0–1 fraction of hotels in the "red" (top) bucket
  shares: Record<Bucket, number>; // 0–1 fractions, sum to 1 across all hotels
}

// Back-compat alias: the city rollup row was historically called MarketRow and
// keyed `city`. MarketRow keeps that field name for existing callers.
export interface MarketRow extends RollupRow {
  city: string;
}

const median = (nums: number[]): number => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// A market must have at least this many hotels to qualify — keeps tiny towns
// with a couple of properties from cluttering the ranking. Mirrors the spirit
// of MIN_MARKET_SIZE in lib/stats.ts but a touch lower so more metros show.
export const MIN_MARKET_SIZE = 15;

// ZIPs are far more granular than cities, so a lower floor keeps useful
// submarkets visible without flooding the list with one-off properties.
export const MIN_ZIP_SIZE = 5;

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

/** Sentinel key for features whose grouping value is blank. Rows with this key
 *  are excluded from the ranking via the minSize gate (their `count` is reported
 *  but they never qualify on their own merits unless minSize is 0). */
export const BLANK_KEY = "—";

/** Generic area-level aggregation. `keyFn` derives a grouping key from each
 *  feature; rows are sorted by average RevPAR descending and only groups with at
 *  least `minSize` hotels qualify. RevPAR-based stats use only hotels that report
 *  a RevPAR; bucket shares are computed over every hotel in the group. Blank keys
 *  collapse to BLANK_KEY and are dropped from the ranking by the minSize gate. */
export function aggregateBy(
  features: HotelFeature[],
  keyFn: (f: HotelFeature) => string,
  minSize: number
): RollupRow[] {
  const byKey = new Map<
    string,
    { count: number; revpars: number[]; buckets: Record<Bucket, number> }
  >();

  for (const f of features) {
    const key = keyFn(f);
    let m = byKey.get(key);
    if (!m) {
      m = { count: 0, revpars: [], buckets: { red: 0, yellow: 0, gray: 0 } };
      byKey.set(key, m);
    }
    m.count += 1;
    const p = f.properties;
    if (p.bucket in m.buckets) m.buckets[p.bucket] += 1;
    if (p.revpar != null) m.revpars.push(p.revpar);
  }

  const rows: RollupRow[] = [];
  for (const [key, m] of byKey) {
    // Blank-key groups never rank, regardless of size.
    if (key === BLANK_KEY || m.count < minSize) continue;
    const avgRevpar = m.revpars.length
      ? m.revpars.reduce((a, b) => a + b, 0) / m.revpars.length
      : 0;
    const shares: Record<Bucket, number> = {
      red: m.buckets.red / m.count,
      yellow: m.buckets.yellow / m.count,
      gray: m.buckets.gray / m.count,
    };
    rows.push({
      key,
      count: m.count,
      avgRevpar,
      medianRevpar: median(m.revpars),
      redShare: shares.red,
      shares,
    });
  }

  rows.sort((a, b) => b.avgRevpar - a.avgRevpar);
  return rows;
}

/** Key function: title-cased city, blank → BLANK_KEY. */
export const cityKey = (f: HotelFeature): string => {
  const raw = (f.properties.city || "").trim();
  return raw === "" ? BLANK_KEY : titleCase(raw);
};

/** Key function: ZIP as a string (never coerced to number — preserves leading
 *  zeros), blank → BLANK_KEY. */
export const zipKey = (f: HotelFeature): string => {
  const raw = (f.properties.zip ?? "").toString().trim();
  return raw === "" ? BLANK_KEY : raw;
};

/** Aggregate a set of hotel features into per-city market rows, sorted by
 *  average RevPAR descending. Only cities with at least MIN_MARKET_SIZE hotels
 *  qualify. Thin wrapper over aggregateBy with the city keyFn; the returned rows
 *  also carry a `city` field for back-compat. */
export function aggregateMarkets(
  features: HotelFeature[],
  minSize: number = MIN_MARKET_SIZE
): MarketRow[] {
  return aggregateBy(features, cityKey, minSize).map((r) => ({
    ...r,
    city: r.key,
  }));
}
