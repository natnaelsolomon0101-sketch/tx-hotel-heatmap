/**
 * convert-sift.mjs — turn a Texas Comptroller hotel tax receipts download
 * (from SIFT, https://data-secure.comptroller.texas.gov) into the per-month
 * period files the pipeline reads: data/periods/YYYY-MON.csv.
 *
 *   node scripts/convert-sift.mjs <download.csv> [more.csv ...]
 *        [--period 2026-JUN]       every row belongs to this month (use when
 *                                  the file has no period/date column)
 *        [--revenue "<column>"]    force the receipts column to use
 *        [--out data/periods]      output folder
 *        [--force]                 overwrite month files that already exist
 *
 * Save an .xlsx download as CSV first (Excel: File > Save As > CSV UTF-8).
 *
 * Columns are found by name, so small header differences between downloads
 * don't matter; the mapping it picked is printed every run. Revenue is the
 * room receipts column. When a download overlaps a month already on file
 * (e.g. it includes May 2026, which came from Box), each candidate receipts
 * column is checked against that month hotel by hotel, and the one that
 * matches is used. That pins down "total" vs "taxable" receipts without a
 * guess. With no overlap it falls back to total room receipts and says so.
 *
 * Each row is filed under the month its reporting period ENDS in, which is
 * how the Box files were laid out: a monthly filer lands in its month, a
 * quarterly filer's whole quarter lands in the quarter's last month.
 * build-history.mjs rolls months into quarters and keeps quarterly filers
 * out of "last month" figures.
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const FORCE = args.includes("--force");
if (FORCE) args.splice(args.indexOf("--force"), 1);
const PERIOD_FLAG = flag("--period");
const REVENUE_FLAG = flag("--revenue");
const OUT = flag("--out") ?? "data/periods";
const inputs = args;
if (!inputs.length) {
  console.error("usage: node scripts/convert-sift.mjs <download.csv> [...] [--period 2026-JUN] [--revenue <column>] [--out dir] [--force]");
  process.exit(1);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const hnorm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = hnorm;
const zip5 = (s) => String(s ?? "").trim().slice(0, 5);
const keyOf = (addr, city, zip) => `${norm(addr)}|${norm(city)}|${zip5(zip)}`;
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const money = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};

// Header candidates, most specific first (normalized: lowercase alphanumerics).
const COLS = {
  taxpayerNumber: ["taxpayernumber", "taxpayerid", "tpnumber", "taxpayerno"],
  taxpayerName: ["taxpayername", "tpname"],
  taxpayerAddress: ["taxpayeraddress"],
  taxpayerCity: ["taxpayercity"],
  taxpayerState: ["taxpayerstate"],
  taxpayerZip: ["taxpayerzip", "taxpayerzipcode"],
  taxpayerPhone: ["taxpayerphone"],
  locationNumber: ["locationnumber", "outletnumber", "locnumber", "locationno"],
  locationName: ["locationname", "outletname", "locname", "dbaname"],
  locationAddress: ["locationaddress", "outletaddress", "locaddress", "locationstreet", "addresstext"],
  locationCity: ["locationcity", "outletcity", "loccity"],
  locationState: ["locationstate", "outletstate", "locstate"],
  locationZip: ["locationzip", "locationzipcode", "outletzip", "loczip", "loczipcode"],
  rooms: ["locationroomcapacity", "roomcapacity", "locationrooms", "rooms", "numberofrooms", "roomcount"],
  period: [
    "obligationenddate", "responsibilityenddate", "reportingperiodenddate", "periodenddate",
    "reportingperiod", "reportperiod", "filingperiod", "reportingmonth", "reportingquarter", "period", "enddate",
  ],
};
// Receipts columns in preference order when there is no overlap to check against.
const REVENUE_CANDIDATES = [
  "locationtotroomreceipts", "locationtotalroomreceipts", "totalroomreceipts", "totroomreceipts", "roomreceipts",
  "locationtaxablereceipts", "taxablereceipts", "revenue", "grossreceipts", "totalreceipts",
];

function resolve(headers) {
  const byNorm = new Map(headers.map((h) => [hnorm(h), h]));
  const col = {};
  for (const [k, cands] of Object.entries(COLS)) col[k] = cands.map((c) => byNorm.get(c)).find(Boolean) ?? null;
  const revenue = REVENUE_CANDIDATES.map((c) => byNorm.get(c)).filter(Boolean);
  // Any other header that looks like a receipts/revenue amount is a candidate too.
  for (const h of headers) if (/receipt|revenue/i.test(h) && !revenue.includes(h)) revenue.push(h);
  return { col, revenue };
}

// Period -> { y, m } for the month the reporting period ends in.
function parsePeriod(v) {
  const s = clean(v);
  let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return { y: +m[3], m: +m[1] - 1 };
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/))) return { y: +m[1], m: +m[2] - 1 };
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})?$/))) return { y: +m[1], m: +m[2] - 1 };
  if ((m = s.match(/^(\d{4})\s*-?\s*Q([1-4])$/i)) || (m = s.match(/^Q([1-4])\s*-?\s*(\d{4})$/i))) {
    const [y, q] = /^\d{4}/.test(s) ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return { y, m: q * 3 - 1 };
  }
  if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s*-?\s*(\d{4})$/))) {
    const mi = MONTHS.indexOf(m[1].toUpperCase());
    if (mi >= 0) return { y: +m[2], m: mi };
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  return null;
}
const fileFor = ({ y, m }) => `${y}-${MONTHS[m]}.csv`;
function existingFileFor(p) {
  if (!fs.existsSync(OUT)) return null;
  return fs.readdirSync(OUT).find((f) => {
    const mm = f.match(/^(\d{4})-([A-Za-z]{3})[A-Za-z]*\.csv$/);
    return mm && +mm[1] === p.y && MONTHS.indexOf(mm[2].toUpperCase()) === p.m;
  }) ?? null;
}

const readCsv = (file) =>
  parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""), {
    columns: (h) => h.map((x) => x.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });

// --- Read + group by month ---------------------------------------------------------
const byMonth = new Map(); // file -> { p, rows: [] }
let revenueCols = null, col = null, unparsed = 0;
for (const input of inputs) {
  const rows = readCsv(input);
  if (!rows.length) continue;
  const r = resolve(Object.keys(rows[0]));
  col = r.col;
  revenueCols = REVENUE_FLAG ? [REVENUE_FLAG] : r.revenue;
  console.log(`\n${path.basename(input)}: ${rows.length.toLocaleString()} rows`);
  for (const [k, v] of Object.entries(col)) console.log(`  ${k.padEnd(16)} <- ${v ? `"${v}"` : "(not found)"}`);
  console.log(`  receipts candidates: ${revenueCols.map((c) => `"${c}"`).join(", ") || "(none)"}`);
  const missing = ["locationAddress", "locationCity", "locationZip", "rooms"].filter((k) => !col[k]);
  if (missing.length || !revenueCols.length || (!col.period && !PERIOD_FLAG)) {
    console.error(`\n✖ Can't map: ${[...missing, ...(revenueCols.length ? [] : ["receipts"]), ...(col.period || PERIOD_FLAG ? [] : ["period (or pass --period YYYY-MON)"])].join(", ")}`);
    console.error(`  Headers in this file: ${Object.keys(rows[0]).join(" | ")}`);
    process.exit(1);
  }
  const fixed = PERIOD_FLAG ? parsePeriod(PERIOD_FLAG) : null;
  if (PERIOD_FLAG && !fixed) throw new Error(`Bad --period ${PERIOD_FLAG}; use e.g. 2026-JUN`);
  for (const row of rows) {
    const p = fixed ?? parsePeriod(row[col.period]);
    if (!p) { unparsed++; continue; }
    const f = fileFor(p);
    if (!byMonth.has(f)) byMonth.set(f, { p, rows: [] });
    byMonth.get(f).rows.push(row);
  }
}
if (unparsed) console.log(`\n  ${unparsed.toLocaleString()} rows had no readable period and were skipped`);

// --- Pick the receipts column -------------------------------------------------------
let revenueCol = revenueCols[0];
if (!REVENUE_FLAG && revenueCols.length > 1) {
  const score = Object.fromEntries(revenueCols.map((c) => [c, { hit: 0, n: 0 }]));
  for (const { p, rows } of byMonth.values()) {
    const ex = existingFileFor(p);
    if (!ex) continue;
    const known = new Map();
    for (const r of readCsv(path.join(OUT, ex))) {
      const k = keyOf(r["Location Address"], r["Location City"], r["Location Zip"]);
      known.set(k, (known.get(k) ?? 0) + (money(r["Revenue"] ?? r[" Revenue "]) ?? 0));
    }
    const mine = new Map();
    for (const r of rows) {
      const k = keyOf(r[col.locationAddress], r[col.locationCity], r[col.locationZip]);
      const e = mine.get(k) ?? {};
      for (const c of revenueCols) e[c] = (e[c] ?? 0) + (money(r[c]) ?? 0);
      mine.set(k, e);
    }
    for (const [k, e] of mine) {
      if (!known.has(k)) continue;
      for (const c of revenueCols) {
        score[c].n++;
        if (Math.abs(e[c] - known.get(k)) < 1) score[c].hit++;
      }
    }
    console.log(`\n  checked receipts columns against ${ex}:`);
  }
  const tested = Object.entries(score).filter(([, s]) => s.n);
  if (tested.length) {
    for (const [c, s] of tested) console.log(`    "${c}": ${s.hit.toLocaleString()} of ${s.n.toLocaleString()} hotels match to the dollar`);
    const [best, s] = tested.sort((a, b) => b[1].hit - a[1].hit)[0];
    if (s.hit / s.n < 0.9) console.log(`  ⚠ best match is only ${Math.round((100 * s.hit) / s.n)}%; check the column before trusting the output`);
    revenueCol = best;
  } else {
    console.log(`\n  ⚠ no overlapping month on file to check against; using "${revenueCol}"`);
  }
}
console.log(`\nUsing receipts column: "${revenueCol}"`);

// --- Write month files ----------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const HEADER = [
  "Taxpayer Number", "Taxpayer Name", "Taxpayer Address", "Taxpayer City", "Taxpayer State", "Taxpayer Zip", "Taxpayer Phone",
  "Location Number", "Location Name", "Location Address", "Location City", "Location State", "Location Zip", "Rooms", "Revenue",
];
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const get = (row, k) => (col[k] ? clean(row[col[k]]) : "");
for (const [file, { p, rows }] of [...byMonth].sort()) {
  const ex = existingFileFor(p);
  if (ex && !FORCE) {
    console.log(`  ${file}: ${rows.length.toLocaleString()} rows; ${ex} already on file, left as-is (--force to replace)`);
    continue;
  }
  // One file per month: replacing "2026-APRIL.csv" with "2026-APR.csv" must
  // not leave both behind (build-history would count the month twice).
  if (ex && ex !== file) fs.unlinkSync(path.join(OUT, ex));
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const rev = money(r[revenueCol]);
    lines.push(
      [
        get(r, "taxpayerNumber"), get(r, "taxpayerName"), get(r, "taxpayerAddress"), get(r, "taxpayerCity"), get(r, "taxpayerState"),
        get(r, "taxpayerZip"), get(r, "taxpayerPhone"), get(r, "locationNumber"), get(r, "locationName"), get(r, "locationAddress"),
        get(r, "locationCity"), get(r, "locationState") || "TX", get(r, "locationZip"), get(r, "rooms"), rev == null ? "" : rev.toFixed(2),
      ].map(csvCell).join(",")
    );
  }
  fs.writeFileSync(path.join(OUT, file), lines.join("\n") + "\n");
  console.log(`  ${file}: wrote ${rows.length.toLocaleString()} rows`);
}
