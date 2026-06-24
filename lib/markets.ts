import { Bucket, HotelFeature } from "./types";

export interface MarketRow {
  city: string;
  count: number;
  avgRevpar: number;
  medianRevpar: number;
  redShare: number; // 0–1 fraction of hotels in the "red" (top) bucket
  shares: Record<Bucket, number>; // 0–1 fractions, sum to 1 across all hotels
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

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

/** Aggregate a set of hotel features into per-city market rows, sorted by
 *  average RevPAR descending. Only cities with at least MIN_MARKET_SIZE hotels
 *  qualify. RevPAR-based stats use only hotels that report a RevPAR; bucket
 *  shares are computed over every hotel in the market. */
export function aggregateMarkets(
  features: HotelFeature[],
  minSize: number = MIN_MARKET_SIZE
): MarketRow[] {
  const byCity = new Map<
    string,
    { count: number; revpars: number[]; buckets: Record<Bucket, number> }
  >();

  for (const f of features) {
    const p = f.properties;
    const raw = (p.city || "—").trim();
    const city = raw === "" ? "—" : titleCase(raw);
    let m = byCity.get(city);
    if (!m) {
      m = { count: 0, revpars: [], buckets: { red: 0, yellow: 0, gray: 0 } };
      byCity.set(city, m);
    }
    m.count += 1;
    if (p.bucket in m.buckets) m.buckets[p.bucket] += 1;
    if (p.revpar != null) m.revpars.push(p.revpar);
  }

  const rows: MarketRow[] = [];
  for (const [city, m] of byCity) {
    if (m.count < minSize) continue;
    const avgRevpar = m.revpars.length
      ? m.revpars.reduce((a, b) => a + b, 0) / m.revpars.length
      : 0;
    const shares: Record<Bucket, number> = {
      red: m.buckets.red / m.count,
      yellow: m.buckets.yellow / m.count,
      gray: m.buckets.gray / m.count,
    };
    rows.push({
      city,
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
