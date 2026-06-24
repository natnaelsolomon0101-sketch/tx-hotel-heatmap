/**
 * build-data.ts — Texas hotel RevPAR pipeline.
 *
 * Reads the Texas Comptroller hotel-occupancy-tax export (data/hotels.csv),
 * computes/normalizes RevPAR, geocodes each hotel, buckets it by RevPAR
 * percentile, and writes public/hotels.geojson for the map to render.
 *
 *   npm run build-data                 # geocode via Mapbox if a token is set, else Census
 *   GEOCODER=census npm run build-data # force the free, no-key US Census batch geocoder
 *   npm run build-data -- --limit 200  # only process the first 200 rows (quick test)
 *   npm run build-data -- --no-geocode # skip geocoding entirely (use cache only)
 *
 * Reruns reuse data/geocache.json so we never re-hit a geocoding API for an
 * address we've already resolved.
 */

import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

// ---------------------------------------------------------------------------
// CONFIG — tune these.
// ---------------------------------------------------------------------------
const CONFIG = {
  inputCsv: "data/hotels.csv",
  outputGeojson: "public/hotels.geojson",
  geocacheFile: "data/geocache.json",

  // Only keep hotels physically located in this state (set to null to keep all).
  stateFilter: "TX",

  // Days in the reporting period — only used when deriving RevPAR for rows that
  // don't already carry a RevPAR value (revenue / (rooms * daysInPeriod)).
  daysInPeriod: 31,

  // Data-quality guards. The Comptroller file is full of aggregate / non-hotel
  // filers that pollute "top performers" and skew the percentile cutoffs:
  //   - city/county tax-collection rollups ("CITY OF GALVESTON")
  //   - 1-room placeholder filings where rooms is a stand-in, not a count
  //   - implausible RevPAR (a real TX hotel tops out near $15k/mo per room)
  // Government rollups are dropped entirely; the others have RevPAR nulled
  // (-> gray, sinks to the bottom of the list) rather than removed.
  excludeNamePattern: /^\s*(city|county|town|village|state)\s+of\b/i,
  minRooms: 2, // 1-room filings are placeholders, not real room counts
  maxRevpar: 20000, // monthly RevPAR ceiling (~$650/night/room)



  // RevPAR bucket cutoffs, expressed as percentiles of the portfolio's RevPAR
  // distribution. >= red cutoff -> red (top third); >= yellow cutoff -> yellow
  // (middle third); everything else, plus missing data -> gray (bottom third).
  bucketPercentiles: {
    red: 0.6667, // top third
    yellow: 0.3333, // middle third
  },

  // "mapbox" (per-address Geocoding API, needs a token) or "census" (free US
  // Census batch geocoder, no key). Defaults to mapbox when a token exists.
  geocoder: (process.env.GEOCODER as "mapbox" | "census" | undefined) ?? null,

  mapboxToken:
    process.env.MAPBOX_GEOCODING_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    "",

  mapboxConcurrency: 10,
} as const;

// Column name aliases — the resolver matches the FIRST header whose normalized
// name contains any of these tokens, so it survives other export shapes.
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["location name", "hotel name", "property name", "name"],
  address: ["location address", "property address", "street", "address"],
  city: ["location city", "city"],
  state: ["location state", "state"],
  zip: ["location zip", "zip", "postal"],
  rooms: ["rooms", "room count", "roomcount", "units"],
  revenue: ["room revenue", "revenue", "room rev"],
  revpar: ["revpar", "rev par"],
  adr: ["adr", "average daily rate"],
  occupancy: ["occupancy", "occ"],
  photo: ["photo", "image", "img", "picture"],
  lat: ["latitude", "lat"],
  lng: ["longitude", "long", "lng", "lon"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Bucket = "red" | "yellow" | "gray";

interface Hotel {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  rooms: number | null;
  revenue: number | null;
  revpar: number | null;
  adr: number | null;
  occupancy: number | null;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  flagged: boolean;
  bucket: Bucket;
}

type GeoCache = Record<string, { lng: number; lat: number } | null>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function resolveColumns(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const aliasNs = aliases.map(norm);
    // Prefer exact normalized match, then "contains".
    const exact = normalized.find((h) => aliasNs.includes(h.n));
    const contains =
      exact ?? normalized.find((h) => aliasNs.some((a) => h.n.includes(a)));
    map[key] = contains ? contains.raw : null;
  }
  return map;
}

function cleanNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cleanOccupancy(v: unknown): number | null {
  const n = cleanNumber(v);
  if (n == null) return null;
  // Express as a 0–1 fraction whether the source used 0.75 or 75(%).
  return n > 1 ? n / 100 : n;
}

const clean = (v: unknown) => String(v ?? "").trim();
const titleAddrKey = (h: Hotel) =>
  norm(`${h.address}|${h.city}|${h.zip}|${h.name}`);
const geoKey = (h: Hotel) =>
  norm(`${h.address}|${h.city}|${h.state}|${h.zip}`);

function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// ---------------------------------------------------------------------------
// Geocoders
// ---------------------------------------------------------------------------
async function geocodeMapbox(
  query: string
): Promise<{ lng: number; lat: number } | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(query)}.json?limit=1&country=US&autocomplete=false` +
    `&access_token=${CONFIG.mapboxToken}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return null;
    const json: any = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.center;
    return { lng, lat };
  }
  return null;
}

/** US Census batch geocoder — free, no key, up to 10k addresses per request. */
async function geocodeCensusBatch(
  hotels: Hotel[]
): Promise<Map<number, { lng: number; lat: number }>> {
  const out = new Map<number, { lng: number; lat: number }>();
  const CHUNK = 5000;
  for (let start = 0; start < hotels.length; start += CHUNK) {
    const chunk = hotels.slice(start, start + CHUNK);
    const lines = chunk.map(
      (h, i) =>
        `${start + i},"${h.address}","${h.city}","${h.state}","${h.zip}"`
    );
    const csv = lines.join("\n");
    const form = new FormData();
    form.append("benchmark", "Public_AR_Current");
    form.append(
      "addressFile",
      new Blob([csv], { type: "text/csv" }),
      "addresses.csv"
    );
    process.stdout.write(
      `  census batch ${start}–${start + chunk.length}... `
    );
    try {
      const res = await fetch(
        "https://geocoding.geo.census.gov/geocoder/locations/addressbatch",
        { method: "POST", body: form }
      );
      const text = await res.text();
      // Response rows: id,input,status,matchType,matchedAddr,"lng,lat",...
      const rows = parse(text, {
        relax_column_count: true,
        skip_empty_lines: true,
      }) as string[][];
      let matched = 0;
      for (const row of rows) {
        const id = Number(row[0]);
        const status = row[2];
        if (status === "Match" && row[5]) {
          const [lng, lat] = row[5].split(",").map(Number);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            out.set(id, { lng, lat });
            matched++;
          }
        }
      }
      console.log(`${matched} matched`);
    } catch (e) {
      console.log(`failed (${(e as Error).message})`);
    }
  }
  return out;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg
    ? Number(limitArg.split("=")[1] ?? args[args.indexOf(limitArg) + 1])
    : Infinity;
  const noGeocode = args.includes("--no-geocode");
  const forcedGeocoder = args.includes("--census")
    ? "census"
    : args.includes("--mapbox")
    ? "mapbox"
    : null;

  const geocoder =
    forcedGeocoder ??
    CONFIG.geocoder ??
    (CONFIG.mapboxToken ? "mapbox" : "census");

  console.log(`\n▶ tx-hotel-heatmap build-data`);
  console.log(`  input:    ${CONFIG.inputCsv}`);
  console.log(`  geocoder: ${geocoder}${noGeocode ? " (skipped)" : ""}`);

  if (!fs.existsSync(CONFIG.inputCsv)) {
    console.error(
      `\n✖ Missing ${CONFIG.inputCsv}. Drop the Box "Texan Hotel Analytics" export there first.`
    );
    process.exit(1);
  }

  // 1) Parse ----------------------------------------------------------------
  const raw = fs.readFileSync(CONFIG.inputCsv, "utf8");
  const records = parse(raw, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  console.log(`\n  parsed ${records.length.toLocaleString()} rows`);

  const headers = Object.keys(records[0] ?? {});
  const col = resolveColumns(headers);
  console.log(
    `  columns -> ` +
      Object.entries(col)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}:"${v}"`)
        .join("  ")
  );

  const get = (rec: Record<string, string>, key: string) =>
    col[key] ? rec[col[key]!] : undefined;

  // 2) Normalize + compute RevPAR ------------------------------------------
  let flaggedCount = 0;
  let hotels: Hotel[] = records.map((rec) => {
    const rooms = cleanNumber(get(rec, "rooms"));
    const revenue = cleanNumber(get(rec, "revenue"));
    let revpar = cleanNumber(get(rec, "revpar"));
    if (revpar == null && revenue != null && rooms && rooms > 0) {
      revpar = revenue / (rooms * CONFIG.daysInPeriod);
    }
    // Reject untrusted RevPAR: 1-room placeholders and implausible highs.
    if (
      (rooms != null && rooms < CONFIG.minRooms) ||
      (revpar != null && revpar > CONFIG.maxRevpar)
    ) {
      revpar = null;
    }
    const flagged = revpar == null || rooms == null || revenue == null;
    if (flagged) flaggedCount++;
    return {
      name: clean(get(rec, "name")),
      address: clean(get(rec, "address")),
      city: clean(get(rec, "city")),
      state: clean(get(rec, "state")).toUpperCase(),
      zip: clean(get(rec, "zip")).slice(0, 5),
      rooms,
      revenue,
      revpar,
      adr: cleanNumber(get(rec, "adr")),
      occupancy: cleanOccupancy(get(rec, "occupancy")),
      photo: clean(get(rec, "photo")) || null,
      lat: cleanNumber(get(rec, "lat")),
      lng: cleanNumber(get(rec, "lng")),
      flagged,
      bucket: "gray",
    };
  });

  // Filter to the target state.
  if (CONFIG.stateFilter) {
    const before = hotels.length;
    hotels = hotels.filter(
      (h) => !h.state || h.state === CONFIG.stateFilter
    );
    console.log(
      `  state filter (${CONFIG.stateFilter}): kept ${hotels.length.toLocaleString()} of ${before.toLocaleString()}`
    );
  }

  // Drop rows with no usable address, no name, or that are government tax
  // rollups rather than actual hotels.
  hotels = hotels.filter(
    (h) => h.name && h.address && !CONFIG.excludeNamePattern.test(h.name)
  );

  // Dedupe by location, keeping the highest-revenue filing.
  const byLoc = new Map<string, Hotel>();
  for (const h of hotels) {
    const k = titleAddrKey(h);
    const prev = byLoc.get(k);
    if (!prev || (h.revenue ?? 0) > (prev.revenue ?? 0)) byLoc.set(k, h);
  }
  hotels = [...byLoc.values()];
  console.log(`  deduped to ${hotels.length.toLocaleString()} unique hotels`);
  console.log(`  flagged (missing data): ${flaggedCount.toLocaleString()}`);

  if (Number.isFinite(limit)) {
    hotels = hotels.slice(0, limit);
    console.log(`  --limit applied: ${hotels.length} hotels`);
  }

  // 3) Geocode --------------------------------------------------------------
  const cache: GeoCache = fs.existsSync(CONFIG.geocacheFile)
    ? JSON.parse(fs.readFileSync(CONFIG.geocacheFile, "utf8"))
    : {};

  // Apply cache + any lat/lng already present in the source.
  const needGeocode: Hotel[] = [];
  for (const h of hotels) {
    if (h.lat != null && h.lng != null) continue;
    const cached = cache[geoKey(h)];
    if (cached !== undefined) {
      if (cached) {
        h.lng = cached.lng;
        h.lat = cached.lat;
      }
    } else if (!noGeocode) {
      needGeocode.push(h);
    }
  }
  console.log(`\n  geocoding ${needGeocode.length.toLocaleString()} hotels...`);

  if (needGeocode.length > 0 && !noGeocode) {
    if (geocoder === "census") {
      const results = await geocodeCensusBatch(needGeocode);
      needGeocode.forEach((h, i) => {
        const r = results.get(i);
        cache[geoKey(h)] = r ?? null;
        if (r) {
          h.lng = r.lng;
          h.lat = r.lat;
        }
      });
    } else {
      if (!CONFIG.mapboxToken) {
        console.error(
          "✖ No Mapbox token. Set MAPBOX_GEOCODING_TOKEN or use GEOCODER=census."
        );
        process.exit(1);
      }
      let done = 0;
      await mapWithConcurrency(
        needGeocode,
        CONFIG.mapboxConcurrency,
        async (h) => {
          const q = `${h.address}, ${h.city}, ${h.state} ${h.zip}`;
          const r = await geocodeMapbox(q);
          cache[geoKey(h)] = r ?? null;
          if (r) {
            h.lng = r.lng;
            h.lat = r.lat;
          }
          if (++done % 250 === 0)
            console.log(`    ${done}/${needGeocode.length}`);
        }
      );
    }
    fs.mkdirSync(path.dirname(CONFIG.geocacheFile), { recursive: true });
    fs.writeFileSync(CONFIG.geocacheFile, JSON.stringify(cache, null, 0));
    console.log(`  cache saved -> ${CONFIG.geocacheFile}`);
  }

  const placed = hotels.filter((h) => h.lat != null && h.lng != null);
  console.log(
    `  placed ${placed.length.toLocaleString()} / ${hotels.length.toLocaleString()} hotels`
  );

  // 4) Bucket by RevPAR percentile -----------------------------------------
  const revparVals = placed
    .map((h) => h.revpar)
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);
  const redCut = quantile(revparVals, CONFIG.bucketPercentiles.red);
  const yellowCut = quantile(revparVals, CONFIG.bucketPercentiles.yellow);
  console.log(
    `\n  RevPAR cutoffs -> yellow >= $${yellowCut.toFixed(0)}, red >= $${redCut.toFixed(0)}`
  );

  const tally: Record<Bucket, number> = { red: 0, yellow: 0, gray: 0 };
  for (const h of placed) {
    if (h.revpar == null || h.revpar <= 0) h.bucket = "gray";
    else if (h.revpar >= redCut) h.bucket = "red";
    else if (h.revpar >= yellowCut) h.bucket = "yellow";
    else h.bucket = "gray";
    tally[h.bucket]++;
  }
  console.log(
    `  buckets -> red ${tally.red}  yellow ${tally.yellow}  gray ${tally.gray}`
  );

  // 5) Write GeoJSON --------------------------------------------------------
  const geojson = {
    type: "FeatureCollection" as const,
    features: placed.map((h) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
      properties: {
        name: h.name,
        address: h.address,
        city: h.city,
        state: h.state,
        zip: h.zip,
        rooms: h.rooms,
        revpar: h.revpar != null ? Math.round(h.revpar) : null,
        adr: h.adr != null ? Math.round(h.adr) : null,
        occupancy: h.occupancy,
        revenue: h.revenue != null ? Math.round(h.revenue) : null,
        bucket: h.bucket,
        photo: h.photo,
        flagged: h.flagged,
      },
    })),
  };

  fs.mkdirSync(path.dirname(CONFIG.outputGeojson), { recursive: true });
  fs.writeFileSync(CONFIG.outputGeojson, JSON.stringify(geojson));
  const kb = (fs.statSync(CONFIG.outputGeojson).size / 1024).toFixed(0);
  console.log(
    `\n✔ wrote ${geojson.features.length.toLocaleString()} features -> ${CONFIG.outputGeojson} (${kb} KB)\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
