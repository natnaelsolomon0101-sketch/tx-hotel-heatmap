/**
 * enrich-hotels.mjs — join the branded-STR source onto public/hotels.geojson.
 *
 *   node scripts/enrich-hotels.mjs
 *
 * The Comptroller pipeline (build-data -> build-history) owns RevPAR/history and
 * writes public/hotels.geojson with plain taxpayer identity. This script runs
 * LAST and layers on the ONLY source of Brand / Parent / Market / Submarket /
 * Hotel Class / Scale / ownership: data/box/texas-hospitality.tsv (771 branded
 * STR hotels). It:
 *
 *   1. Parses the TSV by HEADER NAME (line 1 is a stray "1"; header is line 2).
 *   2. Matches each STR record to an existing geojson feature by normalized
 *      street address + zip5 (fallback: normalized address + city). Matched
 *      features get brand/submarket/etc. and source:'comptroller'.
 *   3. Geocodes the UNMATCHED STR hotels (Google, rooftop only, reusing
 *      data/geocache.google.json) and APPENDS them as new features with fresh
 *      ids, revpar:null, bucket:'gray', flagged:true, source:'str'.
 *
 * Writes public/hotels.geojson (in place) + public/enrichment-report.json.
 * RevPAR and hotel-history.json are untouched, so the final geojson carries
 * BOTH revpar (from build-history) AND brand/submarket (from here).
 */
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const TSV = "data/box/texas-hospitality.tsv";
const GEOJSON = "public/hotels.geojson";
const REPORT = "public/enrichment-report.json";
const GEOCACHE = "data/geocache.google.json";

const GOOGLE_KEY =
  process.env.GOOGLE_GEOCODING_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";
const GEOCODE_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Address normalization (shared between geojson features and STR records).
// ---------------------------------------------------------------------------
const SUFFIX = {
  STREET: "ST",
  ROAD: "RD",
  DRIVE: "DR",
  BOULEVARD: "BLVD",
  FREEWAY: "FWY",
  FRWY: "FWY",
  HIGHWAY: "HWY",
  PARKWAY: "PKY",
  PKWY: "PKY", // geojson (comptroller) uses "PKWY"; collapse both to one form
  AVENUE: "AVE",
  LANE: "LN",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
};

/** Uppercase, strip punctuation, collapse whitespace, standardize suffixes and
 *  directionals to their common abbreviations. Token-wise so we never rewrite a
 *  substring inside another word. */
function normAddr(s) {
  const up = String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!up) return "";
  return up
    .split(" ")
    .map((t) => SUFFIX[t] ?? t)
    .join(" ");
}

/** Uppercase + collapse for city comparison. */
const normCity = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const zip5 = (s) => {
  const m = String(s ?? "").match(/\d{5}/);
  return m ? m[0] : "";
};

const trimOrNull = (s) => {
  const v = String(s ?? "").trim();
  return v === "" ? null : v;
};
const intOrNull = (s) => {
  const v = trimOrNull(s);
  if (v == null) return null;
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

// build-data's geoKey format, so cache entries are shared across pipelines.
const geoKey = (addr, city, state, zip) =>
  `${addr}|${city}|${state}|${zip}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------------------
// 1) Parse the TSV by header name.
//
// The export is a concatenation of paginated blocks: each page starts with a
// stray page-number line (a lone "1", "2", ...) followed by a REPEATED header
// row, and different blocks omit different columns — so column POSITIONS shift
// between blocks. We therefore rebuild the name->index map every time we hit a
// header row and parse each data row against its own block's header.
// ---------------------------------------------------------------------------
const rawLines = fs.readFileSync(TSV, "utf8").split(/\r?\n/);

const NEED = [
  "Rooms",
  "Brand",
  "Parent Company",
  "Property Name",
  "Market Name",
  "Submarket Name",
  "Hotel Class",
  "Scale",
  "Property Address",
  "City",
  "State",
  "Zip",
  "Year Built",
  "Owner Name",
  "Owner Phone",
  "Owner Contact",
];

const isHeaderRow = (cols) => {
  const t = cols.map((c) => c.trim());
  return t.includes("Rooms") && t.includes("Property Name") && t.includes("Brand");
};
const isPageBreak = (cols) => {
  const ne = cols.map((c) => c.trim()).filter(Boolean);
  return ne.length === 1 && /^\d+$/.test(ne[0]);
};
const buildIdx = (cols) => {
  const map = {};
  cols.forEach((h, i) => {
    const n = h.trim();
    if (n && !(n in map)) map[n] = i;
  });
  for (const c of NEED) {
    if (!(c in map)) throw new Error(`TSV header block missing column: "${c}"`);
  }
  return map;
};

const strRecords = [];
let idx = null; // current block's name->index map
let headerBlocks = 0;
for (const line of rawLines) {
  if (!line.trim()) continue;
  const cols = line.split("\t");
  if (isPageBreak(cols)) continue;
  if (isHeaderRow(cols)) {
    idx = buildIdx(cols);
    headerBlocks++;
    continue;
  }
  if (!idx) continue; // data before any header (shouldn't happen)
  const cell = (name) => cols[idx[name]];
  strRecords.push({
    rooms: intOrNull(cell("Rooms")),
    brand: trimOrNull(cell("Brand")),
    parentCompany: trimOrNull(cell("Parent Company")),
    name: trimOrNull(cell("Property Name")),
    market: trimOrNull(cell("Market Name")),
    submarket: trimOrNull(cell("Submarket Name")),
    hotelClass: trimOrNull(cell("Hotel Class")),
    scale: trimOrNull(cell("Scale")),
    address: trimOrNull(cell("Property Address")),
    city: trimOrNull(cell("City")),
    state: trimOrNull(cell("State")),
    zip: trimOrNull(cell("Zip")),
    yearBuilt: intOrNull(cell("Year Built")),
    ownerName: trimOrNull(cell("Owner Name")),
    ownerPhone: trimOrNull(cell("Owner Phone")),
    ownerContact: trimOrNull(cell("Owner Contact")),
  });
}
console.log(
  `Parsed ${strRecords.length} STR records from ${TSV} (${headerBlocks} header block(s))`
);

// ---------------------------------------------------------------------------
// 2) Load geojson + build address lookup maps.
// ---------------------------------------------------------------------------
const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
console.log(`Loaded ${geo.features.length} geojson features`);

// Ensure every existing feature carries source:'comptroller'.
for (const f of geo.features) {
  if (!f.properties.source) f.properties.source = "comptroller";
}

// key -> ordered list of feature indices (a key can repeat).
const byAddrZip = new Map();
const byAddrCity = new Map();
const push = (map, key, i) => {
  if (!key) return;
  let arr = map.get(key);
  if (!arr) map.set(key, (arr = []));
  arr.push(i);
};
geo.features.forEach((f, i) => {
  const p = f.properties;
  const na = normAddr(p.address);
  push(byAddrZip, `${na}|${zip5(p.zip)}`, i);
  push(byAddrCity, `${na}|${normCity(p.city)}`, i);
});

const assigned = new Set(); // feature indices already claimed by an STR record
function claim(list) {
  if (!list) return -1;
  for (const i of list) {
    if (!assigned.has(i)) {
      assigned.add(i);
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 3) Match STR records to features.
// ---------------------------------------------------------------------------
const STR_FIELDS = [
  "brand",
  "parentCompany",
  "market",
  "submarket",
  "hotelClass",
  "scale",
  "ownerName",
  "ownerContact",
  "ownerPhone",
  "yearBuilt",
];

const unmatched = [];
let matched = 0;
for (const r of strRecords) {
  const na = normAddr(r.address);
  let fi = -1;
  if (na) {
    fi = claim(byAddrZip.get(`${na}|${zip5(r.zip)}`));
    if (fi < 0) fi = claim(byAddrCity.get(`${na}|${normCity(r.city)}`));
  }
  if (fi >= 0) {
    const p = geo.features[fi].properties;
    for (const k of STR_FIELDS) if (r[k] != null) p[k] = r[k];
    // source stays 'comptroller' for matched (real tax-filing) hotels.
    matched++;
  } else {
    unmatched.push(r);
  }
}
console.log(
  `Matched ${matched}/${strRecords.length} (${(
    (100 * matched) /
    strRecords.length
  ).toFixed(1)}%); ${unmatched.length} unmatched to geocode`
);

// ---------------------------------------------------------------------------
// 4) Geocode unmatched STR records (Google, rooftop only, cache-backed).
// ---------------------------------------------------------------------------
const cache = fs.existsSync(GEOCACHE)
  ? JSON.parse(fs.readFileSync(GEOCACHE, "utf8"))
  : {};

/** Google geocode -> { lng, lat } accepted only for ROOFTOP/RANGE_INTERPOLATED
 *  results located in TX; otherwise null. */
async function geocode(query) {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&region=us&components=country:US` +
    `&key=${GOOGLE_KEY}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    const json = await res.json();
    if (json.status === "OVER_QUERY_LIMIT") {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (json.status === "REQUEST_DENIED") {
      throw new Error(`Google geocoding denied: ${json.error_message ?? ""}`);
    }
    const r = json.results?.[0];
    if (!r) return null;
    const lt = r.geometry?.location_type;
    if (lt !== "ROOFTOP" && lt !== "RANGE_INTERPOLATED") return null;
    const inTx = (r.address_components ?? []).some(
      (c) =>
        c.types?.includes("administrative_area_level_1") &&
        c.short_name === "TX"
    );
    if (!inTx) return null;
    const loc = r.geometry?.location;
    if (!loc) return null;
    return { lng: loc.lng, lat: loc.lat };
  }
  return null;
}

async function mapWithConcurrency(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx2 = i++;
      await fn(items[idx2], idx2);
    }
  });
  await Promise.all(workers);
}

// Resolve coordinates for each unmatched record (cache first, then API).
const toFetch = [];
for (const r of unmatched) {
  const k = geoKey(r.address ?? "", r.city ?? "", "TX", zip5(r.zip));
  r._key = k;
  if (k in cache) {
    r._coord = cache[k]; // {lng,lat} or null
  } else {
    toFetch.push(r);
  }
}
console.log(
  `Geocoding ${toFetch.length} uncached (${unmatched.length - toFetch.length} from cache)...`
);

let done = 0;
await mapWithConcurrency(toFetch, GEOCODE_CONCURRENCY, async (r) => {
  const q = `${r.address ?? ""}, ${r.city ?? ""}, TX ${zip5(r.zip)}`.trim();
  const coord = await geocode(q);
  cache[r._key] = coord;
  r._coord = coord;
  if (++done % 50 === 0) console.log(`  ${done}/${toFetch.length}`);
});
fs.writeFileSync(GEOCACHE, JSON.stringify(cache));

// ---------------------------------------------------------------------------
// 5) For each geocoded unmatched STR record: try a CONFIDENT proximity merge
//    onto an existing comptroller hotel first (same zip, <0.3mi, and brand/name
//    agree). The address normalizer misses same-building matches when the STR
//    and comptroller addresses are written differently (highway/directional
//    wording), which would otherwise add a duplicate pin. Only records with no
//    confident nearby match get appended as genuinely-new pins.
// ---------------------------------------------------------------------------
const R_MI = 3958.8;
const toRad = (d) => (d * Math.PI) / 180;
function distMi(aLng, aLat, bLng, bLat) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(s));
}
// Tokens that don't distinguish one hotel from another — dropped before name
// comparison so "Hampton Inn & Suites" and "HAMPTON INN" still align.
const STOP_TOK = new Set([
  "HOTEL", "HOTELS", "INN", "SUITES", "SUITE", "BY", "THE", "AND", "OF", "AT",
  "A", "TX", "TEXAS", "RESORT", "RESORTS", "CONFERENCE", "CENTER", "COLLECTION",
]);
const nameTokens = (s) =>
  new Set(
    (s || "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP_TOK.has(t))
  );
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};
// Brand root = first distinctive token of the STR brand ("Hampton by Hilton" ->
// HAMPTON, "Hyatt Place" -> HYATT). Used as a hard anti-mismerge gate: we only
// merge onto a nearby hotel whose name carries the same brand (so a Hilton is
// never fused onto an adjacent Courtyard).
const brandRoot = (brand) => {
  for (const t of (brand || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)) {
    if (t && !STOP_TOK.has(t)) return t;
  }
  return "";
};

// Spatial index of existing features by zip5 — snapshot BEFORE appending any new
// pins, so records never merge/match against pins added in this same pass.
const byZip = new Map();
geo.features.forEach((f, i) => {
  const z = zip5(f.properties.zip);
  if (!z) return;
  let arr = byZip.get(z);
  if (!arr) byZip.set(z, (arr = []));
  arr.push(i);
});

let nextId =
  geo.features.reduce(
    (mx, f) => Math.max(mx, Number(f.properties.id) || 0),
    -1
  ) + 1;

let added = 0;
let mergedByProximity = 0;
let failedGeocode = 0;
for (const r of unmatched) {
  const coord = r._coord;
  if (!coord) {
    failedGeocode++;
    continue;
  }
  // Confident proximity merge onto an existing hotel?
  const cands = byZip.get(zip5(r.zip)) || [];
  const root = brandRoot(r.brand);
  const strTok = nameTokens(r.name);
  let best = -1;
  let bestD = Infinity;
  for (const i of cands) {
    if (assigned.has(i)) continue;
    const cf = geo.features[i];
    const d = distMi(
      coord.lng,
      coord.lat,
      cf.geometry.coordinates[0],
      cf.geometry.coordinates[1]
    );
    if (d > 0.3 || d >= bestD) continue;
    const cName = (cf.properties.name || "").toUpperCase();
    const nameOk =
      (root && cName.includes(root)) ||
      jaccard(strTok, nameTokens(cf.properties.name)) >= 0.6;
    if (nameOk) {
      best = i;
      bestD = d;
    }
  }
  if (best >= 0) {
    assigned.add(best);
    const p = geo.features[best].properties;
    for (const k of STR_FIELDS) if (r[k] != null) p[k] = r[k];
    // source stays 'comptroller' — a real tax-filing hotel we just enriched.
    mergedByProximity++;
    continue;
  }
  // Genuinely new hotel — append as a pin.
  geo.features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [coord.lng, coord.lat] },
    properties: {
      name: r.name ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "TX",
      zip: zip5(r.zip),
      rooms: r.rooms,
      revpar: null,
      lastMonthRevpar: null,
      lastMonth: null,
      adr: null,
      occupancy: null,
      revenue: null,
      bucket: "gray",
      photo: null,
      flagged: true,
      id: nextId++,
      brand: r.brand,
      parentCompany: r.parentCompany,
      market: r.market,
      submarket: r.submarket,
      hotelClass: r.hotelClass,
      scale: r.scale,
      ownerName: r.ownerName,
      ownerContact: r.ownerContact,
      ownerPhone: r.ownerPhone,
      yearBuilt: r.yearBuilt,
      source: "str",
    },
  });
  added++;
}

// ---------------------------------------------------------------------------
// 6) Enriched-per-submarket tally (matched + added, any submarket set).
// ---------------------------------------------------------------------------
const submarkets = {};
for (const f of geo.features) {
  const sm = f.properties.submarket;
  if (sm) submarkets[sm] = (submarkets[sm] ?? 0) + 1;
}

fs.writeFileSync(GEOJSON, JSON.stringify(geo));
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(
  REPORT,
  JSON.stringify(
    {
      strRecords: strRecords.length,
      matched,
      mergedByProximity,
      added,
      failedGeocode,
      submarkets,
    },
    null,
    2
  )
);

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
const topSubs = Object.entries(submarkets)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
const peers3 = Object.values(submarkets).filter((n) => n >= 3).length;
console.log("\n=== Enrichment complete ===");
console.log(`STR records:        ${strRecords.length}`);
console.log(`matched (address):  ${matched}`);
console.log(`merged (proximity): ${mergedByProximity}`);
console.log(`added (new pins):   ${added}`);
console.log(`enriched total:     ${matched + mergedByProximity}`);
console.log(`failed geocode:     ${failedGeocode}`);
console.log(`total features:     ${geo.features.length}`);
console.log(`submarkets w/ >=3:  ${peers3}`);
console.log(`top submarkets:     ${topSubs.map(([s, n]) => `${s} (${n})`).join(", ")}`);
console.log(`wrote ${GEOJSON} + ${REPORT}`);
