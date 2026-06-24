export type Bucket = "red" | "yellow" | "gray";

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
