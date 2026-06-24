import { HotelFeature } from "./types";

const CSV_HEADER = [
  "name",
  "address",
  "city",
  "state",
  "zip",
  "rooms",
  "revpar",
  "adr",
  "occupancy",
  "revenue",
  "bucket",
  "lng",
  "lat",
] as const;

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a CSV string for a set of hotel features. Shared by the main list
 *  export and the watchlist export so both produce identical columns. */
export function buildCsv(features: HotelFeature[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const f of features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    lines.push(
      [
        p.name,
        p.address,
        p.city,
        p.state,
        p.zip,
        p.rooms,
        p.revpar,
        p.adr,
        p.occupancy,
        p.revenue,
        p.bucket,
        lng,
        lat,
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

/** Trigger a browser download of `features` as a CSV file. */
export function downloadCsv(features: HotelFeature[], filename: string): void {
  const blob = new Blob([buildCsv(features)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
