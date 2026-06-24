export type Bucket = "red" | "yellow" | "gray";

/**
 * One point on a hotel's 2023→present RevPAR trend (see scripts/build-history.mjs).
 * `revpar` is an average-month RevPAR on the same basis as the map's RevPAR, so
 * the latest point lines up with `HotelProperties.revpar`.
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
  revpar: number | null;
  adr: number | null;
  occupancy: number | null; // 0–1 fraction when known
  revenue: number | null;
  bucket: Bucket;
  photo: string | null;
  flagged: boolean; // true when key inputs were missing
  // 2023→present history (added by scripts/build-history.mjs; may be absent on old data).
  history?: TrendPoint[];
  t12Revenue?: number | null; // trailing 12mo revenue (last 4 complete quarters)
  t12Revpar?: number | null; // trailing 12mo average monthly RevPAR
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
