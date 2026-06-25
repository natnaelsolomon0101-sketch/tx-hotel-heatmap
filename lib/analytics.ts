import { Bucket, HotelFeature } from "./types";

/**
 * Scatter plot data point with optional outlier flag and feature reference.
 */
export interface ScatterPoint {
  feature: HotelFeature;
  name: string;
  rooms: number;
  revpar: number;
  bucket: Bucket;
  isOutlier: boolean;
}

/**
 * Compute scatter plot data for RevPAR vs rooms visualization.
 * Filters to hotels with both rooms and RevPAR data.
 * Marks hotels as outliers if they fall >2 standard deviations from the
 * mean of their bucket (or overall if no bucket data).
 */
export function computeScatterPlotData(
  features: HotelFeature[]
): ScatterPoint[] {
  const valid = features.filter(
    (f) => f.properties.rooms != null && f.properties.revpar != null
  );

  if (valid.length === 0) return [];

  // Compute stats per bucket for outlier detection
  const byBucket = new Map<
    Bucket,
    { revpars: number[]; mean: number; stdev: number }
  >();
  const allRevpars: number[] = [];

  for (const f of valid) {
    const b = f.properties.bucket;
    let bucket = byBucket.get(b);
    if (!bucket) {
      bucket = { revpars: [], mean: 0, stdev: 0 };
      byBucket.set(b, bucket);
    }
    bucket.revpars.push(f.properties.revpar!);
    allRevpars.push(f.properties.revpar!);
  }

  // Compute mean and stdev for each bucket
  for (const bucket of byBucket.values()) {
    const mean =
      bucket.revpars.reduce((a, b) => a + b, 0) / bucket.revpars.length;
    const variance =
      bucket.revpars.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
      bucket.revpars.length;
    bucket.mean = mean;
    bucket.stdev = Math.sqrt(variance);
  }

  // Compute overall stats as fallback
  const overallMean = allRevpars.reduce((a, b) => a + b, 0) / allRevpars.length;
  const overallVariance =
    allRevpars.reduce((sum, x) => sum + Math.pow(x - overallMean, 2), 0) /
    allRevpars.length;
  const overallStdev = Math.sqrt(overallVariance);

  // Create scatter points with outlier detection
  const points: ScatterPoint[] = valid.map((f) => {
    const bucket = byBucket.get(f.properties.bucket);
    const mean = bucket?.mean ?? overallMean;
    const stdev = bucket?.stdev ?? overallStdev;
    const zscore = stdev > 0 ? (f.properties.revpar! - mean) / stdev : 0;
    const isOutlier = Math.abs(zscore) > 2;

    return {
      feature: f,
      name: f.properties.name,
      rooms: f.properties.rooms!,
      revpar: f.properties.revpar!,
      bucket: f.properties.bucket,
      isOutlier,
    };
  });

  return points;
}

/**
 * A single RevPAR outlier relative to its city median.
 */
export interface Outlier {
  feature: HotelFeature;
  cityMedian: number;
  zscore: number;
  ratio: number;
}

/**
 * Result of {@link computeRevenueConcentration}.
 */
export interface RevenueConcentration {
  topPct: number;
  totalRevenue: number | null;
  concentrated: number | null;
}

/**
 * Detect hotels whose RevPAR is significantly different from their city median.
 * Returns outliers sorted by absolute z-score (most extreme first).
 * Requires at least 5 hotels per city to compute median.
 */
export function computeOutliers(features: HotelFeature[]): Outlier[] {
  const byCity = new Map<
    string,
    { features: HotelFeature[]; revpars: number[] }
  >();

  // Group by city
  for (const f of features) {
    if (f.properties.revpar == null) continue;
    const city = f.properties.city || "";
    let group = byCity.get(city);
    if (!group) {
      group = { features: [], revpars: [] };
      byCity.set(city, group);
    }
    group.features.push(f);
    group.revpars.push(f.properties.revpar);
  }

  // Compute medians and identify outliers
  const outliers: Outlier[] = [];

  for (const group of byCity.values()) {
    if (group.revpars.length < 5) continue; // Min city size

    const sorted = [...group.revpars].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    // Compute MAD (median absolute deviation) for robust outlier detection
    const deviations = sorted.map((x) => Math.abs(x - median));
    const sortedDev = [...deviations].sort((a, b) => a - b);
    const midDev = Math.floor(sortedDev.length / 2);
    const mad =
      sortedDev.length % 2
        ? sortedDev[midDev]
        : (sortedDev[midDev - 1] + sortedDev[midDev]) / 2;

    const threshold = 2.5; // MAD-based threshold (constant × MAD)

    for (const f of group.features) {
      const revpar = f.properties.revpar!;
      const deviation = Math.abs(revpar - median);
      if (deviation > threshold * (mad || 1)) {
        const zscore = mad > 0 ? deviation / mad : 0;
        const ratio = median > 0 ? revpar / median : 1;
        outliers.push({
          feature: f,
          cityMedian: median,
          zscore,
          ratio,
        });
      }
    }
  }

  // Sort by absolute z-score descending (most extreme first)
  outliers.sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore));
  return outliers;
}

/**
 * Compute revenue concentration: what % of total revenue comes from the top 10%
 * of hotels by revenue? Returns top percentage, total revenue, and concentrated revenue.
 * Only considers hotels with revenue data.
 */
export function computeRevenueConcentration(
  features: HotelFeature[]
): RevenueConcentration {
  const withRevenue = features.filter((f) => f.properties.revenue != null);

  if (withRevenue.length === 0) {
    return { topPct: 10, totalRevenue: null, concentrated: null };
  }

  // Sort by revenue descending
  const sorted = [...withRevenue].sort(
    (a, b) => (b.properties.revenue ?? 0) - (a.properties.revenue ?? 0)
  );

  const topPct = 10;
  const topCount = Math.max(1, Math.ceil((topPct / 100) * sorted.length));
  const topRevenue = sorted
    .slice(0, topCount)
    .reduce((sum, f) => sum + (f.properties.revenue ?? 0), 0);
  const totalRevenue = sorted.reduce((sum, f) => sum + (f.properties.revenue ?? 0), 0);

  return {
    topPct,
    totalRevenue: totalRevenue || null,
    concentrated: topRevenue || null,
  };
}

/**
 * Combined analytics result: scatter points, RevPAR outliers, and revenue
 * concentration for a single in-scope hotel set.
 */
export interface Analytics {
  scatter: ScatterPoint[];
  outliers: Outlier[];
  concentration: RevenueConcentration;
}

/**
 * Compute scatter, outliers, and revenue concentration in a single orchestrated
 * call so callers walk the hotel set once at the call site instead of three
 * times. Returns values byte-identical to invoking the three helpers
 * independently — this is purely an orchestration/perf wrapper, the formulas
 * are unchanged.
 */
export function computeAnalytics(features: HotelFeature[]): Analytics {
  return {
    scatter: computeScatterPlotData(features),
    outliers: computeOutliers(features),
    concentration: computeRevenueConcentration(features),
  };
}
