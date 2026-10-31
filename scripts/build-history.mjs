/**
 * build-history.mjs — compute correct RevPAR for public/hotels.geojson from the
 * Texas Comptroller period files in data/periods/.
 *
 *   node scripts/build-history.mjs
 *
 * Two RevPAR figures, BOTH expressed per available room-night:
 *
 *   T12 RevPAR   = trailing-12-month revenue / rooms / 365
 *                  (the last four COMPLETE consecutive quarters on file, e.g.
 *                  2025Q2 + Q3 + Q4 + 2026Q1; 366 days if they span a Feb 29).
 *                  This is the headline metric the heatmap buckets / filters /
 *                  sorts on (properties.revpar).
 *
 *   Last-month   = latest reported month's revenue / rooms / days-in-that-month
 *                  (e.g. 2026-MAY -> /31). properties.lastMonthRevpar.
 *
 * Why this script owns RevPAR: the source Comptroller files report revenue PER
 * PERIOD — a single MONTH for the monthly files, a QUARTER for the quarterly
 * files — but their RevPAR column always divides by 90 days. So a single month
 * over 90 days understated monthly RevPAR ~3x. We recompute on the correct
 * day-count basis from the raw revenue.
 *
 * Reads (data/periods/, gitignored, copied from Box "Texan Hotel Analytics"
 * or written by scripts/convert-sift.mjs from a Comptroller SIFT download):
 *   2023.csv                 — variable filings per hotel within 2023 → summed to ANNUAL
 *   2024Q2..2025Q4.csv       — one row per hotel per quarter (pre-aggregated)
 *   2026-JAN.csv, ...        — one row per hotel per month → rolled into quarters
 * The period axis, T12 window and "last month" are derived from whichever
 * files are present (see the period discovery block below), so adding a new
 * month is: drop the file in, re-run.
 *
 * Hotels are matched to existing geojson features by normalized
 * Location Address + City + 5-digit Zip (the same key the map was built on).
 * Feature ids are never renumbered. Hotels that are new in the latest files
 * are added first by scripts/add-new-hotels.mjs.
 *
 * Writes (in place):
 *   public/hotels.geojson      — sets properties.revpar = T12 RevPAR (per night),
 *                                properties.lastMonthRevpar, properties.lastMonth,
 *                                properties.revenue = latest-month revenue, and
 *                                re-buckets by the T12 RevPAR distribution.
 *   public/hotel-history.json  — per matched feature (keyed by feature id):
 *                                { history, t12Revenue, t12Revpar,
 *                                  lastMonthRevenue, lastMonthRevpar, lastMonth }
 *
 * Each trend point is a per-night RevPAR for that period (periodRevenue /
 * rooms / daysInPeriod) so every point — quarter, year, or partial — is on the
 * same nightly basis as T12 and the map.
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";

const PERIOD_DIR = "data/periods";
const GEOJSON = "public/hotels.geojson";
// Trend/T12 live in a separate file loaded on-demand (only when a card opens),
// so the map's initial geojson stays lean. Keyed by the feature's `id`.
const HISTORY = "public/hotel-history.json";

// Data-quality guards (mirror build-data.ts).
const MIN_ROOMS = 2; // 1-room filings are placeholders, not real room counts
const MAX_REVPAR = 2000; // $/night/room ceiling — rejects data errors / bad room counts

// ---------------------------------------------------------------------------
// Periods are discovered from the files present in data/periods/, so a data
// refresh is "drop the new month files in, re-run". File names:
//   YYYY.csv        annual baseline (variable filings summed per hotel)
//   YYYYQn.csv      one quarter, pre-aggregated
//   YYYY-MON*.csv   one reporting month (JAN, FEB, MAR, APR or APRIL, ...).
//                   A month file holds monthly filers for that month PLUS
//                   quarterly filers whose quarter ends that month, so months
//                   roll up into their calendar quarter.
// A month-built quarter is complete only when all three of its months are
// present; otherwise it is a partial trend point (on the same per-night basis).
// ---------------------------------------------------------------------------
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0-11
const qOfMonth = (y, m) => `${y}Q${Math.floor(m / 3) + 1}`;
const daysInQuarter = (y, q) => [0, 1, 2].reduce((s, i) => s + daysInMonth(y, (q - 1) * 3 + i), 0);

const annualFiles = []; // { file, label, days }
const quarterFiles = []; // { file, q, y, n }
const monthFiles = []; // { file, y, m, q }
for (const file of fs.readdirSync(PERIOD_DIR).filter((f) => f.endsWith(".csv")).sort()) {
  let mm;
  if ((mm = file.match(/^(\d{4})\.csv$/))) {
    const y = Number(mm[1]);
    annualFiles.push({ file, label: String(y), days: isLeap(y) ? 366 : 365 });
  } else if ((mm = file.match(/^(\d{4})Q([1-4])\.csv$/))) {
    quarterFiles.push({ file, q: `${mm[1]}Q${mm[2]}`, y: Number(mm[1]), n: Number(mm[2]) });
  } else if ((mm = file.match(/^(\d{4})-([A-Za-z]{3})[A-Za-z]*\.csv$/))) {
    const y = Number(mm[1]);
    const m = MONTHS.indexOf(mm[2].toUpperCase());
    if (m < 0) throw new Error(`Unrecognized month in ${file}`);
    monthFiles.push({ file, y, m, q: qOfMonth(y, m) });
  } else {
    console.warn(`  (skipping unrecognized period file ${file})`);
  }
}
monthFiles.sort((a, b) => a.y - b.y || a.m - b.m);
if (!monthFiles.length) throw new Error(`No monthly files (YYYY-MON.csv) in ${PERIOD_DIR}`);

// Quarter axis, oldest -> newest. Annual baselines come first.
const quarterInfo = new Map(); // q -> { days, partial, months:Set }
for (const { q, y, n } of quarterFiles) quarterInfo.set(q, { y, n, days: daysInQuarter(y, n), partial: false, fromFile: true });
for (const { q, y, m } of monthFiles) {
  if (quarterInfo.get(q)?.fromFile) throw new Error(`${q} has both a quarterly file and month files`);
  const info = quarterInfo.get(q) ?? { y, n: Math.floor(m / 3) + 1, days: 0, months: new Set() };
  info.months.add(m);
  info.days += daysInMonth(y, m);
  quarterInfo.set(q, info);
}
for (const info of quarterInfo.values()) if (info.months) info.partial = info.months.size < 3;
const sortedQuarters = [...quarterInfo.keys()].sort();
const QUARTERS = [...annualFiles.map((a) => a.label), ...sortedQuarters];
// Actual calendar days in each reporting period: the per-night divisor.
const DAYS_IN = Object.fromEntries([
  ...annualFiles.map((a) => [a.label, a.days]),
  ...sortedQuarters.map((q) => [q, quarterInfo.get(q).days]),
]);
const PARTIAL = new Set(sortedQuarters.filter((q) => quarterInfo.get(q).partial));
const ANNUAL = new Set(annualFiles.map((a) => a.label));

// T12 = the last four COMPLETE, consecutive quarters. Their day counts sum to
// 365 (366 across a Feb 29), the divisor for T12 RevPAR.
const complete = sortedQuarters.filter((q) => !PARTIAL.has(q));
const T12_QUARTERS = complete.slice(-4);
{
  const idx = (q) => Number(q.slice(0, 4)) * 4 + Number(q.slice(5)) - 1;
  const ok = T12_QUARTERS.length === 4 && T12_QUARTERS.every((q, i) => i === 0 || idx(q) === idx(T12_QUARTERS[i - 1]) + 1);
  if (!ok) throw new Error(`T12 needs 4 consecutive complete quarters; have ${T12_QUARTERS.join(", ")}`);
}
const T12_DAYS = T12_QUARTERS.reduce((s, q) => s + DAYS_IN[q], 0);

// Latest reported single month: drives "last month" RevPAR.
const lm = monthFiles[monthFiles.length - 1];
const LAST_MONTH = {
  file: lm.file,
  label: `${MONTH_LABEL[lm.m]} ${lm.y}`,
  days: daysInMonth(lm.y, lm.m),
  // When the latest month closes a quarter, its file also carries quarterly
  // filers' whole-quarter totals. Those are not one month of revenue, so they
  // get no last-month figure. A quarterly filer = appears in the quarter-end
  // month but in neither earlier month of that quarter.
  quarterEnd: lm.m % 3 === 2,
  priorMonthFiles: monthFiles.filter((f) => f.q === lm.q && f.m < lm.m).map((f) => f.file),
};
console.log(`Periods: ${QUARTERS.join(" ")}`);
console.log(`  partial: ${[...PARTIAL].join(" ") || "none"}   T12: ${T12_QUARTERS.join(" + ")} (${T12_DAYS} days)   last month: ${LAST_MONTH.label}`);

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
// revLastMonth: Map<hotelKey, revenue> for the latest single month only.
const revLastMonth = new Map();

console.log("Reading period files from", PERIOD_DIR, "...");
const revOf = (r) => money(r[" Revenue "] ?? r["Revenue"]);
const keyOfRow = (r) => keyOf(r["Location Address"], r["Location City"], r["Location Zip"]);

// Annual baselines: sum every filing row per hotel.
for (const { file, label } of annualFiles) {
  for (const r of loadPeriod(file)) addRevenue(keyOfRow(r), label, revOf(r));
}
// Quarterly files: one row per hotel; sum on the off chance a key repeats.
for (const { file, q } of quarterFiles) {
  for (const r of loadPeriod(file)) addRevenue(keyOfRow(r), q, revOf(r));
}
// Month files: roll each month into its quarter, and capture the latest
// reported month separately for last-month RevPAR.
const priorMonthKeys = new Set();
for (const file of LAST_MONTH.priorMonthFiles) for (const r of loadPeriod(file)) priorMonthKeys.add(keyOfRow(r));
let quarterlyFilersSkipped = 0;
for (const { file, q } of monthFiles) {
  for (const r of loadPeriod(file)) {
    const k = keyOfRow(r);
    const rev = revOf(r);
    addRevenue(k, q, rev);
    if (file !== LAST_MONTH.file) continue;
    if (LAST_MONTH.quarterEnd && !priorMonthKeys.has(k)) {
      quarterlyFilersSkipped++;
      continue;
    }
    revLastMonth.set(k, (revLastMonth.get(k) ?? 0) + rev);
  }
}
if (LAST_MONTH.quarterEnd) console.log(`  ${LAST_MONTH.label} closes a quarter: ${quarterlyFilersSkipped.toLocaleString()} quarterly-filer rows kept out of last-month figures`);

console.log("Hotels with any historical revenue:", revByQuarter.size.toLocaleString());

// Mutate geojson in place + build a SEPARATE history file keyed by feature id,
// so the map never downloads the trend data up front.
const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
const round = (n) => Math.round(n);
const round2 = (n) => Math.round(n * 100) / 100;
const historyOut = {}; // id -> { history, t12Revenue, t12Revpar, lastMonth* }

let anyHist = 0, fullT12 = 0, withLastMonth = 0;

// Feature ids are permanent: history, watchlists and shared links key on them.
// Existing ids are never renumbered; a feature without one gets the next free id.
let nextId = geo.features.reduce((mx, f) => Math.max(mx, Number.isInteger(f.properties.id) ? f.properties.id : -1), -1) + 1;

geo.features.forEach((f) => {
  const p = f.properties;
  if (!Number.isInteger(p.id)) p.id = nextId++;
  const i = p.id;
  // Rows appended by enrich-hotels.mjs (source "str") have no Comptroller
  // filing of their own; leave them as they are.
  if (p.source && p.source !== "comptroller") return;
  // Drop any trend fields baked in by an earlier run — they live in HISTORY now.
  delete p.history;
  delete p.t12Revenue;
  delete p.t12Revpar;

  const key = keyOf(p.address, p.city, p.zip);
  const m = revByQuarter.get(key);
  const rooms = Number(p.rooms) || 0;
  const validRooms = rooms >= MIN_ROOMS;

  // --- Last-month RevPAR (month revenue / rooms / days-in-month) -----------
  const lastMonthRevenue = revLastMonth.has(key) ? round(revLastMonth.get(key)) : null;
  let lastMonthRevpar = null;
  if (validRooms && lastMonthRevenue != null && lastMonthRevenue > 0) {
    const v = lastMonthRevenue / (rooms * LAST_MONTH.days);
    if (v <= MAX_REVPAR) lastMonthRevpar = round2(v);
  }
  // properties.revenue is the latest reported month (the card labels it so).
  // No filing that month -> null, never a stale figure under the new label.
  p.revenue = lastMonthRevenue;
  p.lastMonthRevpar = lastMonthRevpar;
  p.lastMonth = LAST_MONTH.label;
  if (lastMonthRevpar != null) withLastMonth++;

  if (!m) {
    // No quarterly history → no T12. Heatmap RevPAR is null (gray).
    p.revpar = null;
    if (lastMonthRevenue != null) {
      historyOut[i] = {
        history: [],
        t12Revenue: null,
        t12Revpar: null,
        lastMonthRevenue,
        lastMonthRevpar,
        lastMonth: LAST_MONTH.label,
      };
    }
    return;
  }

  // --- Trend: one per-night RevPAR point per quarter that reported ---------
  const history = [];
  for (const q of QUARTERS) {
    if (!m.has(q)) continue;
    const revenue = m.get(q);
    const revpar = validRooms ? revenue / (rooms * DAYS_IN[q]) : null;
    const pt = { q, revenue: round(revenue), revpar: revpar == null ? null : round2(revpar) };
    if (ANNUAL.has(q)) pt.annual = true;
    if (PARTIAL.has(q)) pt.partial = true;
    history.push(pt);
  }

  // --- T12 RevPAR (trailing 12mo revenue / rooms / T12 days) --------------
  const hasAll = T12_QUARTERS.every((q) => m.has(q));
  let t12Revenue = null, t12Revpar = null;
  if (hasAll) {
    const t12 = T12_QUARTERS.reduce((s, q) => s + m.get(q), 0);
    t12Revenue = round(t12);
    if (validRooms) {
      const v = t12 / (rooms * T12_DAYS);
      if (v > 0 && v <= MAX_REVPAR) t12Revpar = round2(v);
    }
    fullT12++;
  }

  // T12 RevPAR drives the heatmap. Rounded to a whole dollar for buckets/filters.
  p.revpar = t12Revpar == null ? null : Math.round(t12Revpar);

  if (history.length || t12Revenue != null || lastMonthRevenue != null) {
    historyOut[i] = {
      history,
      t12Revenue,
      t12Revpar,
      lastMonthRevenue,
      lastMonthRevpar,
      lastMonth: LAST_MONTH.label,
    };
    if (history.length) anyHist++;
  }
});

// --- Re-bucket by tertiles of the new T12 RevPAR distribution -------------
function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
const vals = geo.features
  .map((f) => f.properties.revpar)
  .filter((v) => v != null && v > 0)
  .sort((a, b) => a - b);
const RED_P = 0.6667, YELLOW_P = 0.3333;
const redCut = quantile(vals, RED_P);
const yellowCut = quantile(vals, YELLOW_P);

const tally = { red: 0, yellow: 0, gray: 0 };
for (const f of geo.features) {
  const v = f.properties.revpar;
  let bucket;
  if (v == null || v <= 0) bucket = "gray";
  else if (v >= redCut) bucket = "red";
  else if (v >= yellowCut) bucket = "yellow";
  else bucket = "gray";
  f.properties.bucket = bucket;
  tally[bucket]++;
}

fs.writeFileSync(GEOJSON, JSON.stringify(geo));
fs.writeFileSync(HISTORY, JSON.stringify(historyOut));

const n = geo.features.length;
const pct = (x) => `${((100 * x) / n).toFixed(1)}%`;
const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
console.log(`\n=== RevPAR recomputed (T12 = revenue / rooms / ${T12_DAYS}) ===`);
console.log(`features:               ${n.toLocaleString()}`);
console.log(`with T12 RevPAR:        ${vals.length.toLocaleString()} (${pct(vals.length)})`);
console.log(`with last-month RevPAR: ${withLastMonth.toLocaleString()} (${pct(withLastMonth)})`);
console.log(`with any trend history: ${anyHist.toLocaleString()} (${pct(anyHist)})`);
console.log(`with full T12 revenue:  ${fullT12.toLocaleString()} (${pct(fullT12)})`);
console.log(`median T12 RevPAR:      $${median.toLocaleString()}`);
console.log(`avg T12 RevPAR:         $${avg.toLocaleString()}`);
console.log(`bucket cutoffs:         yellow >= $${Math.round(yellowCut)}, red >= $${Math.round(redCut)}`);
console.log(`buckets:                red ${tally.red}  yellow ${tally.yellow}  gray ${tally.gray}`);
console.log(`geojson (lean):         ${GEOJSON} (${(fs.statSync(GEOJSON).size / 1e6).toFixed(1)} MB)`);
console.log(`history (on-demand):    ${HISTORY} (${(fs.statSync(HISTORY).size / 1e6).toFixed(1)} MB)`);
