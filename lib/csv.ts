import { HotelFeature } from "./types";
import { MarketRow } from "./markets";

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
  triggerCsvDownload(buildCsv(features), filename);
}

const MARKET_CSV_HEADER = [
  "City",
  "Hotels",
  "Avg RevPAR",
  "Median RevPAR",
  "Total Revenue",
  "Top Hotel",
] as const;

// MarketRow does not carry per-market revenue totals or a top-hotel name, so
// those columns may be supplied via these optional fields when a caller has
// computed them; otherwise they serialize as blank cells.
type MarketExportRow = MarketRow & {
  totalRevenue?: number | null;
  topHotel?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build a market-aggregate CSV: one row per market with City, Hotels,
 *  Avg RevPAR, Median RevPAR, Total Revenue, and Top Hotel columns. Mirrors the
 *  per-hotel CSV serialization but over MarketRow aggregates. */
export function buildMarketsCsv(rows: MarketExportRow[]): string {
  const lines = [MARKET_CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.city,
        r.count,
        round2(r.avgRevpar),
        round2(r.medianRevpar),
        r.totalRevenue == null ? "" : round2(r.totalRevenue),
        r.topHotel ?? "",
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

/** Trigger a browser download of market aggregates as a CSV file named
 *  `tx-markets-${rows.length}.csv`. */
export function exportMarkets(rows: MarketRow[]): void {
  triggerCsvDownload(buildMarketsCsv(rows), `tx-markets-${rows.length}.csv`);
}

/** Shared blob-download helper for CSV strings. */
function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  // Defer cleanup: Firefox/Safari cancel the in-flight download if the object
  // URL is revoked synchronously before the navigation has been dispatched.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
