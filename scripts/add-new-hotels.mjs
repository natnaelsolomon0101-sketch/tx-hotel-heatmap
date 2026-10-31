/**
 * add-new-hotels.mjs — append hotels that first appear in the newest
 * Comptroller month files to public/hotels.geojson, without touching any
 * existing feature.
 *
 *   node scripts/add-new-hotels.mjs            # add + geocode
 *   node scripts/add-new-hotels.mjs --dry-run  # report only, write nothing
 *
 * Run it after new month files land in data/periods/ and BEFORE
 * scripts/build-history.mjs (which then fills in RevPAR / history for the new
 * features the same way it does for every other hotel).
 *
 * What counts as new: a location (normalized Location Address + City + 5-digit
 * Zip, the key the map is built on) that appears in a month file NEWER than the
 * geojson's current "last month" and matches no existing feature, after the
 * same filters build-data.ts uses: Texas only, not a city/county tax rollup,
 * more than 10 rooms. Duplicate rows for one location keep the highest-revenue
 * filing.
 *
 * Existing features are never edited, re-ordered or renumbered: their ids,
 * names (including the cleaned owner-LLC names), owner/brand enrichment and
 * coordinates carry forward as-is. New features get ids above the current max.
 *
 * Geocoding, most precise first (nothing is guessed):
 *   1. A lodging POI in the local OSM gazetteer (OSM_GAZETTEER, default
 *      ~/hoteladdr/osm/TX.json) whose name matches the hotel and which sits
 *      within 3 km of the Census address point, or (no Census point) in the
 *      hotel's own city/ZIP area. OSM POIs are building-level.
 *   2. Otherwise an EXACT Census address match (free US Census batch
 *      geocoder; interpolated along the street).
 * A Census "Non_Exact" hit with no OSM confirmation, or no hit at all, is not
 * used: the hotel is left off the map and listed in data/update-report.json.
 *
 * Duplicate guard: a "new" location within 150 m of an existing map feature
 * with a similar name is treated as that feature under a different address
 * spelling, and skipped (listed in the report).
 *
 * Names: the Comptroller "Location Name" is usually the hotel's own name.
 * When it is an owner entity instead, the same cleanup as the July fix applies:
 *   "PLANO JOINT VENTURE DBA MOTEL 6"  -> "MOTEL 6"
 *   "LAKEWAY INN LLC"                  -> "LAKEWAY INN"
 * with the original entity kept in `owner`. Entity names with no hotel name
 * inside are kept as-is and flagged in the report.
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";

const PERIOD_DIR = "data/periods";
const GEOJSON = "public/hotels.geojson";
const REPORT = "data/update-report.json";
const DRY = process.argv.includes("--dry-run");

// Mirror build-data.ts filters.
const STATE = "TX";
const EXCLUDE_NAME = /^\s*(city|county|town|village|state)\s+of\b/i;
const DROP_AT_OR_UNDER_ROOMS = 10;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const zip5 = (s) => String(s ?? "").trim().slice(0, 5);
const keyOf = (addr, city, zip) => `${norm(addr)}|${norm(city)}|${zip5(zip)}`;
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const money = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

// --- Name cleanup (owner entity -> hotel name) -------------------------------
const HOTEL_WORD =
  /\b(INN|INNS|HOTEL|HOTELS|MOTEL|MOTOR|SUITES?|LODGE|RESORT|HAMPTON|HILTON|MARRIOTT|COURTYARD|FAIRFIELD|HOLIDAY|HYATT|SHERATON|WESTIN|RADISSON|LA QUINTA|BEST WESTERN|COMFORT|SLEEP|QUALITY|DAYS|SUPER 8|MOTEL 6|RED ROOF|EXTENDED STAY|STAYBRIDGE|CANDLEWOOD|HOMEWOOD|RESIDENCE|SPRINGHILL|TOWNEPLACE|ALOFT|ELEMENT|CAMBRIA|WINGATE|MICROTEL|BAYMONT|AMERICAS BEST|ECONO|ROADWAY|RODEWAY|TRAVELODGE|HOME2|TRU|EMBASSY|DOUBLETREE|WYNDHAM|AVID|CROWNE|INTOWN|WOODSPRING|SONESTA|OMNI|KIMPTON|GAYLORD|RENAISSANCE|AUTOGRAPH|TAPESTRY|ASCEND|CLARION|MAINSTAY|SUBURBAN|STUDIO 6|GUESTHOUSE|B ?& ?B)\b/i;
const ENTITY_SUFFIX =
  /[\s,]+(L\.?\s?L\.?\s?C\.?|L\.?\s?L\.?\s?P\.?|L\.?\s?P\.?|INC\.?|INCORPORATED|LTD\.?|LIMITED|CORP\.?|CORPORATION|CO\.?|COMPANY|P\.?C\.?)$/i;

function cleanName(raw) {
  const name = clean(raw);
  const dba = name.match(/\b(?:D\/?B\/?A|DBA)\b[\s:.-]*(.+)$/i);
  if (dba && clean(dba[1]).length >= 3) {
    return { name: clean(dba[1]).replace(ENTITY_SUFFIX, ""), owner: name, how: "dba" };
  }
  if (ENTITY_SUFFIX.test(name)) {
    let stripped = name;
    while (ENTITY_SUFFIX.test(stripped)) stripped = stripped.replace(ENTITY_SUFFIX, "").trim();
    stripped = stripped.replace(/[,\s]+$/, "");
    if (HOTEL_WORD.test(stripped) && stripped.length >= 3) return { name: stripped, owner: name, how: "suffix" };
    return { name, owner: null, how: "entity-no-hotel-word" };
  }
  return { name, owner: null, how: null };
}

// --- Period files ------------------------------------------------------------
function monthFiles() {
  return fs
    .readdirSync(PERIOD_DIR)
    .map((file) => {
      const m = file.match(/^(\d{4})-([A-Za-z]{3})[A-Za-z]*\.csv$/);
      if (!m) return null;
      const mi = MONTHS.indexOf(m[2].toUpperCase());
      return mi < 0 ? null : { file, y: Number(m[1]), m: mi, label: `${MONTH_LABEL[mi]} ${m[1]}` };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y || a.m - b.m);
}
function loadPeriod(file) {
  return parse(fs.readFileSync(`${PERIOD_DIR}/${file}`, "utf8"), {
    columns: (h) => h.map((x) => x.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
}
const labelIndex = (label) => {
  const [mon, y] = String(label ?? "").split(" ");
  const mi = MONTH_LABEL.indexOf(mon);
  return mi < 0 ? -1 : Number(y) * 12 + mi;
};

// --- Census batch geocoder (free, no key) -------------------------------------
async function geocodeCensus(rows) {
  const out = new Map();
  const CHUNK = 5000;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const csv = chunk
      .map((h, i) => `${start + i},"${h.address.replace(/"/g, "")}","${h.city.replace(/"/g, "")}","${h.state}","${h.zip}"`)
      .join("\n");
    const form = new FormData();
    form.append("benchmark", "Public_AR_Current");
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    process.stdout.write(`  census batch ${start}-${start + chunk.length}... `);
    try {
      const res = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form });
      const text = await res.text();
      const parsed = parse(text, { relax_column_count: true, skip_empty_lines: true });
      let matched = 0;
      for (const row of parsed) {
        if (row[2] === "Match" && row[5]) {
          const [lng, lat] = row[5].split(",").map(Number);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            out.set(Number(row[0]), { lng, lat, matchType: row[3], matched: row[4] });
            matched++;
          }
        }
      }
      console.log(`${matched} matched`);
    } catch (e) {
      console.log(`failed (${e.message})`);
    }
  }
  return out;
}

// Texas bounding box, loose. A Census hit outside it is a bad match.
const inTexas = ({ lng, lat }) => lng > -106.7 && lng < -93.4 && lat > 25.8 && lat < 36.6;

// --- OSM gazetteer + name matching ----------------------------------------------
const OSM_PATH = process.env.OSM_GAZETTEER ?? `${process.env.HOME}/hoteladdr/osm/TX.json`;
const GENERIC = new Set(
  "the a an of at by and hotel hotels inn inns suites suite motel motels resort lodge lodging area near plus express tx texas llc inc lp ltd".split(" ")
);
// Brand words: two names carrying different brands are different hotels
// (a Courtyard and a Residence Inn often share one address).
const BRAND = new Set(
  "hampton hilton garden homewood home2 tru embassy doubletree curio tapestry marriott courtyard fairfield residence springhill towneplace aloft element moxy westin sheraton renaissance autograph holiday crowne staybridge candlewood avid indigo kimpton hyatt wyndham baymont microtel wingate ramada days super travelodge howard quinta laquinta comfort quality sleep clarion econo rodeway ascend cambria mainstay suburban woodspring radisson country best western drury omni sonesta extended stay motel6 studio6 super8 hiexpress holidayinn comfortinn comfortsuites budgetsuites red roof americas intown".split(" ")
);
// "Motel 6" / "Studio 6" / "Super 8" are brands, not a bare number that
// would match any other "6" or "8".
const tokens = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b(motel|studio|super)\s*-?\s*(6|8)\b/g, "$1$2")
    // Sister brands that differ only in a generic word are different hotels.
    .replace(/\bholiday inn express\b/g, "hiexpress")
    .replace(/\bholiday inn\b/g, "holidayinn")
    .replace(/\bcomfort (inn|suites)\b/g, "comfort$1")
    .replace(/\bbudget suites\b/g, "budgetsuites")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
// Distinguishing tokens of a hotel name: generic lodging words and the
// hotel's own city name removed ("OZONA EXPRESS" in Ozona has none left).
// "Residence Inn by Marriott" -> "Residence Inn": the parent company says
// nothing about which hotel it is.
const BY_PARENT = /\bby\s+(marriott|hilton|wyndham|ihg|hyatt|choice|best western|radisson|sonesta)\b/gi;
const coreTokens = (s, city) => {
  const cityToks = new Set(tokens(city));
  return new Set(tokens(String(s ?? "").replace(BY_PARENT, " ")).filter((t) => !GENERIC.has(t) && !cityToks.has(t)));
};
// Location descriptors only count alongside a real name token ("Airport Inn"
// is not "Corpus Christi Airport & Conference Center").
const DESCRIPTOR = new Set(
  "north south east west northwest northeast southwest southeast n s e w nw ne sw se airport downtown dt conference convention center ctr medical university mall interstate highway hwy i loop fwy freeway parkway pkwy".split(" ")
);
function nameSim(a, b, city = "") {
  const A = coreTokens(a, city), B = coreTokens(b, city);
  if (!A.size || !B.size) return 0;
  const brandsA = [...A].filter((t) => BRAND.has(t)), brandsB = [...B].filter((t) => BRAND.has(t));
  if (brandsA.length && brandsB.length && !brandsA.some((t) => B.has(t))) return 0;
  let inter = 0, named = false;
  // A shared number alone ("6", "1st") is not a name match.
  for (const t of A) if (B.has(t)) { inter++; if (!DESCRIPTOR.has(t) && /[a-z]{2}/.test(t)) named = true; }
  if (!named) return 0;
  // When one name's tokens all sit inside the other's, the longer name's
  // extra tokens must be brand or location words: "Courtyard" ~ "Courtyard
  // Dallas NW", but "Angelina Motel" is not "Angelina College".
  if (inter === Math.min(A.size, B.size) && A.size !== B.size) {
    const [small, big] = A.size < B.size ? [A, B] : [B, A];
    const smallBranded = [...small].some((t) => BRAND.has(t));
    if (!smallBranded && [...big].some((t) => !small.has(t) && !DESCRIPTOR.has(t) && !BRAND.has(t) && /[a-z]{2}/.test(t))) return 0;
  }
  return inter / Math.min(A.size, B.size); // containment: "Drury Inn Austin North" ~ "Drury Inn & Suites Austin North"
}
const metres = (a, b) => {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
function loadOsm() {
  try {
    const d = JSON.parse(fs.readFileSync(OSM_PATH, "utf8"));
    return (d.elements ?? [])
      .map((e) => ({
        name: e.tags?.name,
        lat: e.lat ?? e.center?.lat,
        lng: e.lon ?? e.center?.lon,
        city: norm(e.tags?.["addr:city"]),
        zip: zip5(e.tags?.["addr:postcode"]),
        kind: e.tags?.tourism,
      }))
      .filter((e) => e.name && Number.isFinite(e.lat) && Number.isFinite(e.lng) && ["hotel", "motel", "guest_house", "hostel", "apartment"].includes(e.kind));
  } catch {
    console.log(`  (no OSM gazetteer at ${OSM_PATH}; Census only)`);
    return [];
  }
}
/** Best OSM lodging POI for a hotel.
 *  With a Census point (`near`): name match >= 0.67 within 400 m of an
 *  exact Census point or 1.5 km of a rougher one; nearest wins.
 *  Without one: name match >= 0.67, tagged with the hotel's ZIP or city (or
 *  within 5 km of the ZIP's centroid on the current map), at most 25 km out,
 *  and unambiguous: if another matching POI sits > 500 m away, no match. */
function osmMatch(osm, h, near, zipCentroid) {
  const zc = zipCentroid.get(h.zip);
  const hits = [];
  const hotelBranded = [...coreTokens(h.name, h.city)].some((t) => BRAND.has(t));
  for (const o of osm) {
    const sim = nameSim(h.name, o.name, h.city);
    if (sim < 0.67) continue;
    // A branded POI ("La Quinta ... Normandy") is not an unbranded filer
    // ("Normandy Inn Motel") that happens to share a word.
    if (!hotelBranded && [...coreTokens(o.name, h.city)].some((t) => BRAND.has(t))) continue;
    if (near) {
      // An exact Census address point is already good; only an OSM POI right
      // next to it can refine it. A rougher Census point allows more slack.
      const d = metres(near, o);
      if (d <= (near.matchType === "Exact" ? 400 : 1500)) hits.push({ ...o, sim, d, from: "census point" });
    } else {
      const d = zc ? metres(zc, o) : null;
      const tagged = (o.zip && o.zip === h.zip) || (o.city && o.city === norm(h.city));
      if ((tagged && (d == null || d <= 25000)) || (d != null && d <= 5000)) hits.push({ ...o, sim, d, from: "zip centroid" });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.sim - a.sim || (a.d ?? 0) - (b.d ?? 0));
  const best = hits[0];
  if (!near && hits.some((o) => o !== best && o.sim >= best.sim - 0.1 && metres(o, best) > 500)) return null;
  return best;
}

// --- Main ----------------------------------------------------------------------
const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
const existing = new Set(geo.features.map((f) => keyOf(f.properties.address, f.properties.city, f.properties.zip)));
const counts = {};
for (const f of geo.features) {
  const l = f.properties.lastMonth;
  if (l) counts[l] = (counts[l] ?? 0) + 1;
}
const currentLast = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
const files = monthFiles();
const newer = files.filter((f) => labelIndex(f.label) > labelIndex(currentLast));
console.log(`Map's current last month: ${currentLast ?? "unknown"}`);
console.log(`Newer month files: ${newer.map((f) => f.file).join(", ") || "none"}`);

const candidates = new Map(); // key -> row
const skipped = { outOfState: 0, rollup: 0, smallOrNoRooms: 0, noAddress: 0, alreadyOnMap: 0 };
for (const { file, label } of newer) {
  for (const r of loadPeriod(file)) {
    const h = {
      rawName: clean(r["Location Name"]),
      taxpayer: clean(r["Taxpayer Name"]),
      locationNumber: clean(r["Location Number"]),
      address: clean(r["Location Address"]),
      city: clean(r["Location City"]),
      state: clean(r["Location State"]).toUpperCase(),
      zip: zip5(r["Location Zip"]),
      rooms: int(r["Rooms"]),
      revenue: money(r[" Revenue "] ?? r["Revenue"]),
      firstSeen: label,
    };
    if (h.state && h.state !== STATE) { skipped.outOfState++; continue; }
    if (!h.address || !h.rawName) { skipped.noAddress++; continue; }
    if (EXCLUDE_NAME.test(h.rawName)) { skipped.rollup++; continue; }
    if (h.rooms == null || h.rooms <= DROP_AT_OR_UNDER_ROOMS) { skipped.smallOrNoRooms++; continue; }
    const k = keyOf(h.address, h.city, h.zip);
    if (existing.has(k)) { skipped.alreadyOnMap++; continue; }
    const prev = candidates.get(k);
    if (!prev) candidates.set(k, h);
    else if (h.revenue > prev.revenue) candidates.set(k, { ...h, firstSeen: prev.firstSeen });
  }
}
const fresh = [...candidates.values()];
console.log(`New locations (> ${DROP_AT_OR_UNDER_ROOMS} rooms, not on the map): ${fresh.length}`);

const report = {
  generatedAt: new Date().toISOString(),
  currentLastMonth: currentLast,
  newerFiles: newer.map((f) => f.file),
  skipped,
  added: [],
  unmapped: [],
  entityNamesKept: [],
};

if (fresh.length) {
  const osm = loadOsm();
  // ZIP centroids from the existing map, for OSM matches without a Census point.
  const zipAcc = new Map();
  for (const f of geo.features) {
    const z = f.properties.zip, [lng, lat] = f.geometry.coordinates;
    const a = zipAcc.get(z) ?? { lat: 0, lng: 0, n: 0 };
    a.lat += lat; a.lng += lng; a.n++;
    zipAcc.set(z, a);
  }
  const zipCentroid = new Map([...zipAcc].map(([z, a]) => [z, { lat: a.lat / a.n, lng: a.lng / a.n }]));
  const existingPts = geo.features.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.name, owner: f.properties.owner, id: f.properties.id }));
  // Older month files (at or before the map's current last month): tells a
  // first-time filer apart from a hotel that filed before but never made the map.
  const olderKeys = new Set();
  for (const f of files.filter((f) => labelIndex(f.label) <= labelIndex(currentLast))) {
    for (const r of loadPeriod(f.file)) olderKeys.add(keyOf(r["Location Address"], r["Location City"], r["Location Zip"]));
  }

  const geos = DRY ? new Map() : await geocodeCensus(fresh);
  report.duplicatesSkipped = [];
  let nextId = geo.features.reduce((mx, f) => Math.max(mx, Number.isInteger(f.properties.id) ? f.properties.id : -1), -1) + 1;
  fresh.forEach((h, i) => {
    const nm = cleanName(h.rawName);
    const hk = keyOf(h.address, h.city, h.zip);
    const base = {
      name: nm.name, address: h.address, city: h.city, zip: h.zip, rooms: h.rooms,
      taxpayer: h.taxpayer, locationNumber: h.locationNumber, firstSeen: h.firstSeen,
      kind: olderKeys.has(hk) ? "filed before, missing from map" : "new filer",
    };
    if (nm.how === "entity-no-hotel-word") report.entityNamesKept.push(base);
    if (DRY) { report.unmapped.push({ ...base, reason: "dry run (not geocoded)" }); return; }

    const c = geos.get(i);
    const census = c && inTexas(c) ? c : null;
    const o = osm.length ? osmMatch(osm, { ...h, name: nm.name }, census, zipCentroid) || (nm.owner ? osmMatch(osm, { ...h, name: h.rawName }, census, zipCentroid) : null) : null;
    let pt = null, via = null;
    if (o) { pt = { lng: o.lng, lat: o.lat }; via = `osm "${o.name}"${o.d != null ? ` ${Math.round(o.d)} m from ${o.from}` : ""}`; }
    else if (census && census.matchType === "Exact") { pt = census; via = "census exact"; }
    if (!pt) {
      report.unmapped.push({ ...base, reason: census ? `census ${census.matchType} only, no OSM confirmation` : c ? "census match outside Texas" : "no census or OSM match" });
      return;
    }
    // Duplicate guard: same hotel already on the map under another address spelling.
    const dup = existingPts.find((e) => metres(e, pt) <= 150 && (nameSim(e.name, nm.name, h.city) >= 0.67 || nameSim(e.owner, h.rawName, h.city) >= 0.67));
    if (dup) { report.duplicatesSkipped.push({ ...base, existingId: dup.id, existingName: dup.name, via }); return; }
    // A point on top of a different pin (within 25 m, different address, no
    // name match) is usually the other hotel's POI picked up by a loose
    // match, or a renamed property under a new taxpayer. Leave it for review.
    const taken = existingPts.find((e) => metres(e, pt) <= 25);
    if (taken) {
      report.unmapped.push({ ...base, reason: `point within 25 m of existing pin ${taken.id} "${taken.name}" (${via})` });
      return;
    }

    const id = nextId++;
    const props = {
      name: nm.name,
      address: h.address,
      city: h.city,
      state: STATE,
      zip: h.zip,
      rooms: h.rooms,
      revpar: null,
      adr: null,
      occupancy: null,
      revenue: null,
      bucket: "gray",
      photo: null,
      flagged: false,
      id,
      lastMonthRevpar: null,
      lastMonth: null,
      source: "comptroller",
    };
    if (nm.owner) props.owner = nm.owner;
    geo.features.push({ type: "Feature", geometry: { type: "Point", coordinates: [pt.lng, pt.lat] }, properties: props });
    existingPts.push({ ...pt, name: nm.name, owner: nm.owner, id });
    report.added.push({ id, ...base, via, lng: pt.lng, lat: pt.lat, nameFix: nm.how });
  });
}

console.log(`Added: ${report.added.length}   Unmapped (left off the map): ${report.unmapped.length}   Duplicates skipped: ${report.duplicatesSkipped?.length ?? 0}   Entity names kept as-is: ${report.entityNamesKept.length}`);
if (!DRY) {
  fs.writeFileSync(GEOJSON, JSON.stringify(geo));
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${GEOJSON} (${geo.features.length.toLocaleString()} features) and ${REPORT}`);
} else {
  console.log("(dry run: nothing written)");
}
