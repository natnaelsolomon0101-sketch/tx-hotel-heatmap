export type Bucket = "red" | "yellow" | "gray";

/**
 * One point on a hotel's 2023→present RevPAR trend (see scripts/build-history.mjs).
 * `revpar` is a per-night RevPAR for that period (period revenue / rooms /
 * days-in-period), so every point — quarter, year, or partial — is comparable
 * and on the same nightly basis as the map's T12 RevPAR.
 */
export interface TrendPoint {
  q: string; // "2023" | "2024Q2" … "2026Q2"
  revenue: number; // period revenue ($); full-year for the 2023 point
  revpar: number | null;
  annual?: boolean; // 2023 baseline = full-year revenue
  partial?: boolean; // 2026Q2 = partial quarter (Apr+May only)
}

/** Properties carried on each hotel feature in public/hotels.geojson. */
export interface HotelProperties {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  rooms: number | null;
  revpar: number | null; // T12 RevPAR ($/night): trailing-12mo revenue / rooms / 365
  lastMonthRevpar: number | null; // latest month's revenue / rooms / days-in-month
  lastMonth: string | null; // label for the latest reported month, e.g. "May 2026"
  adr: number | null;
  occupancy: number | null; // 0–1 fraction when known
  revenue: number | null; // latest reported month's room revenue ($)
  bucket: Bucket;
  photo: string | null;
  flagged: boolean; // true when key inputs were missing
  id?: number; // stable index; joins to public/hotel-history.json
}

/**
 * Trend + T12 for one hotel. Lives in public/hotel-history.json (keyed by
 * HotelProperties.id) and is fetched lazily so the map's geojson stays lean.
 */
export interface HotelHistory {
  history: TrendPoint[];
  t12Revenue: number | null; // trailing-12mo revenue (last 4 complete quarters)
  t12Revpar: number | null; // T12 RevPAR ($/night): t12Revenue / rooms / 365
  lastMonthRevenue: number | null; // latest reported month's room revenue ($)
  lastMonthRevpar: number | null; // latest month's revenue / rooms / days-in-month
  lastMonth: string | null; // label for the latest reported month, e.g. "May 2026"
}

export type HotelFeature = GeoJSON.Feature<GeoJSON.Point, HotelProperties>;
export type HotelCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  HotelProperties
>;

export const BUCKET_COLORS: Record<Bucket, string> = {
  red: "#ee2233",
  yellow: "#f5b301",
  gray: "#9aa0a6",
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  red: "Top third RevPAR",
  yellow: "Middle third RevPAR",
  gray: "Bottom third / no data",
};
