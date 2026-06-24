import { Bucket, HotelFeature } from "./types";

export interface PortfolioStats {
  total: number;
  withRevpar: number;
  avgRevpar: number | null;
  medianRevpar: number | null;
  topMarket: { city: string; avg: number; count: number } | null;
  buckets: Record<Bucket, number>;
}

const median = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// A market must have at least this many hotels (with RevPAR) to qualify as
// "top market" — keeps tiny resort towns with a couple luxury rentals from
// outranking real metros.
const MIN_MARKET_SIZE = 20;

/** Portfolio-level summary over a set of hotel features (typically the current
 *  filtered/in-view set). */
export function computeStats(features: HotelFeature[]): PortfolioStats {
  const buckets: Record<Bucket, number> = { red: 0, yellow: 0, gray: 0 };
  const revpars: number[] = [];
  const byCity = new Map<string, { sum: number; count: number }>();

  for (const f of features) {
    const p = f.properties;
    if (p.bucket in buckets) buckets[p.bucket] += 1;
    if (p.revpar != null) {
      revpars.push(p.revpar);
      const city = p.city || "—";
      const m = byCity.get(city) ?? { sum: 0, count: 0 };
      m.sum += p.revpar;
      m.count += 1;
      byCity.set(city, m);
    }
  }

  let topMarket: PortfolioStats["topMarket"] = null;
  for (const [city, m] of byCity) {
    if (m.count < MIN_MARKET_SIZE) continue;
    const avg = m.sum / m.count;
    if (!topMarket || avg > topMarket.avg) {
      topMarket = { city, avg, count: m.count };
    }
  }

  return {
    total: features.length,
    withRevpar: revpars.length,
    avgRevpar: revpars.length
      ? revpars.reduce((a, b) => a + b, 0) / revpars.length
      : null,
    medianRevpar: median(revpars),
    topMarket,
    buckets,
  };
}

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

export const fmtMoney = (n: number | null): string =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });

export const fmtMarket = (m: PortfolioStats["topMarket"]): string =>
  m ? titleCase(m.city) : "—";
