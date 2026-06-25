/**
 * build-history.mjs — enrich public/hotels.geojson with a 2023→present RevPAR
 * trend and trailing-twelve-month (T12) revenue + RevPAR, from the Texas
 * Comptroller period files in data/periods/.
 *
 *   node scripts/build-history.mjs
 *
 * Reads (data/periods/, gitignored, copied from Box "Texan Hotel Analytics"):
 *   2023.csv                 — variable filings per hotel within 2023 → summed to ANNUAL
 *   2024Q2..2025Q4.csv       — one row per hotel per quarter (pre-aggregated)
 *   2026-JAN..2026-MAY.csv   — one row per hotel per month → rolled into 2026Q1 / 2026Q2
 *
 * Hotels are matched to existing geojson features by normalized
 * Location Address + City + 5-digit Zip (the same key the map was built on).
 *
 * Output (mutates public/hotels.geojson in place), per matched feature:
 *   history:     [{ q, revenue, revpar, annual?, partial? }]
 *   t12Revenue:  trailing 12mo revenue (2025Q2+Q3+Q4+2026Q1), or null if any quarter missing
 *   t12Revpar:   trailing-12mo average monthly RevPAR, or null
 *
 * RevPAR basis: revenue / rooms / 90 (Nate's definition), matching the map.
 * Each trend point is the average-MONTH RevPAR for that period:
 *   revpar = periodRevenue / (rooms * 90 * monthsInPeriod)
 * so the latest point lines up with the map's RevPAR.
 */
const REVPAR_DAYS = 90;
import { parse } from "csv-parse/sync";
import fs from "node:fs";

const PERIOD_DIR = "data/periods";
const GEOJSON = "public/hotels.geojson";
// Trend/T12 live in a separate file loaded on-demand (only when a card opens),
// so the map's initial geojson stays lean. Keyed by the feature's `id`.
const HISTORY = "public/hotel-history.json";

// Quarter axis, oldest → newest. 2023 is a single annual baseline point.
const QUARTERS = [
  "2023",
  "2024Q2", "2024Q3", "2024Q4",
  "2025Q1", "2025Q2", "2025Q3", "2025Q4",
  "2026Q1", "2026Q2",
];
// Months that roll up into 2026 quarters.
const MONTH_TO_Q = {
  "2026-JAN": "2026Q1", "2026-FEB": "2026Q1", "2026-MAR": "2026Q1",
  "2026-APRIL": "2026Q2", "2026-MAY": "2026Q2", // 2026Q2 is partial (no June yet)
};
// Months counted per period, for monthly run-rate RevPAR normalization.
const MONTHS_IN = {
  "2023": 12,
  "2024Q2": 3, "2024Q3": 3, "2024Q4": 3,
  "2025Q1": 3, "2025Q2": 3, "2025Q3": 3, "2025Q4": 3,
  "2026Q1": 3, "2026Q2": 2, // only Apr + May reported so far
};
// T12 = the last four COMPLETE quarters (2026Q2 is partial, excluded).
const T12_QUARTERS = ["2025Q2", "2025Q3", "2025Q4", "2026Q1"];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const zip5 = (s) => String(s ?? "").trim().slice(0, 5);
const keyOf = (addr, city, zip) => `${norm(addr)}|${norm(city)}|${zip5(zip)}`;
const money = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function loadPeriod(file) {
  const raw = fs.readFileSync(`${PERIOD_DIR}/${file}`, "utf8");
  return parse(raw, {
    columns: (h) => h.map((x) => x.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
}

// revByQuarter: Map<hotelKey, Map<quarter, revenue>>
const revByQuarter = new Map();
function addRevenue(hotelKey, quarter, revenue) {
  let m = revByQuarter.get(hotelKey);
  if (!m) revByQuarter.set(hotelKey, (m = new Map()));
  m.set(quarter, (m.get(quarter) ?? 0) + revenue);
}

console.log("Reading period files from", PERIOD_DIR, "...");

// 2023 — sum every filing row per hotel into the annual figure.
for (const r of loadPeriod("2023.csv")) {
  addRevenue(keyOf(r["Location Address"], r["Location City"], r["Location Zip"]), "2023", money(r[" Revenue "] ?? r["Revenue"]));
}
// Quarterly files — one row per hotel; sum on the off chance a key repeats.
for (const q of ["2024Q2", "2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
  for (const r of loadPeriod(`${q}.csv`)) {
    addRevenue(keyOf(r["Location Address"], r["Location City"], r["Location Zip"]), q, money(r[" Revenue "] ?? r["Revenue"]));
  }
}
// 2026 monthly files — roll each month into its quarter.
for (const [file, q] of Object.entries(MONTH_TO_Q)) {
  for (const r of loadPeriod(`${file}.csv`)) {
    addRevenue(keyOf(r["Location Address"], r["Location City"], r["Location Zip"]), q, money(r[" Revenue "] ?? r["Revenue"]));
  }
}

console.log("Hotels with any historical revenue:", revByQuarter.size.toLocaleString());

// Build a lean geojson (base fields + a stable `id`) and a SEPARATE history
// file keyed by that id, so the map never downloads the trend data up front.
const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
let anyHist = 0, fullT12 = 0;
const round = (n) => Math.round(n);
const historyOut = {}; // id -> { history, t12Revenue, t12Revpar }

geo.features.forEach((f, i) => {
  const p = f.properties;
  p.id = i;
  // Drop any trend fields baked in by an earlier run — they live in HISTORY now.
  delete p.history;
  delete p.t12Revenue;
  delete p.t12Revpar;

  const m = revByQuarter.get(keyOf(p.address, p.city, p.zip));
  const rooms = Number(p.rooms) || 0;
  if (!m) return;

  // Trend: one point per quarter that reported, RevPAR as a monthly run-rate
  // (period revenue / rooms / months-in-period) so all points are comparable.
  const history = [];
  for (const q of QUARTERS) {
    if (!m.has(q)) continue;
    const revenue = m.get(q);
    const revpar = rooms > 0 ? revenue / (rooms * REVPAR_DAYS * MONTHS_IN[q]) : null;
    const pt = { q, revenue: round(revenue), revpar: revpar == null ? null : Math.round(revpar * 100) / 100 };
    if (q === "2023") pt.annual = true;
    if (q === "2026Q2") pt.partial = true;
    history.push(pt);
  }

  // T12 — only if all four complete quarters are present.
  const hasAll = T12_QUARTERS.every((q) => m.has(q));
  let t12Revenue = null, t12Revpar = null;
  if (hasAll) {
    const t12 = T12_QUARTERS.reduce((s, q) => s + m.get(q), 0);
    t12Revenue = round(t12);
    // Trailing-12mo average monthly RevPAR, same basis as the map / trend line.
    t12Revpar = rooms > 0 ? Math.round((t12 / (rooms * REVPAR_DAYS * 12)) * 100) / 100 : null;
    fullT12++;
  }

  if (history.length || t12Revenue != null) {
    historyOut[i] = { history, t12Revenue, t12Revpar };
    if (history.length) anyHist++;
  }
});

fs.writeFileSync(GEOJSON, JSON.stringify(geo));
fs.writeFileSync(HISTORY, JSON.stringify(historyOut));

const n = geo.features.length;
const pct = (x) => `${((100 * x) / n).toFixed(1)}%`;
console.log("\n=== enrichment report ===");
console.log(`features:               ${n.toLocaleString()}`);
console.log(`with any trend history: ${anyHist.toLocaleString()} (${pct(anyHist)})`);
console.log(`with full T12:          ${fullT12.toLocaleString()} (${pct(fullT12)})`);
console.log(`geojson (lean):         ${GEOJSON} (${(fs.statSync(GEOJSON).size / 1e6).toFixed(1)} MB)`);
console.log(`history (on-demand):    ${HISTORY} (${(fs.statSync(HISTORY).size / 1e6).toFixed(1)} MB)`);
