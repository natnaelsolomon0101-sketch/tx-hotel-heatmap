/**
 * validate-update.mjs — check a refreshed data/hotels.full.geojson (+ history)
 * against the version it replaced, before committing.
 *
 *   git show HEAD:data/hotels.full.geojson > /tmp/before.geojson
 *   node scripts/validate-update.mjs /tmp/before.geojson
 *
 * Fails (exit 1) if any existing feature lost its id, name, owner, brand
 * enrichment or coordinates, or if any feature lacks a history entry it had.
 * Prints added features, RevPAR coverage, and a 10-hotel spot check that
 * recomputes last-month RevPAR straight from the newest month file.
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";

const beforePath = process.argv[2];
if (!beforePath) {
  console.error("usage: node scripts/validate-update.mjs <before.geojson> [before-history.json]");
  process.exit(1);
}
const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync("data/hotels.full.geojson", "utf8"));
const history = JSON.parse(fs.readFileSync("public/hotel-history.json", "utf8"));

const KEEP = ["name", "address", "city", "zip", "rooms", "owner", "brand", "parentCompany", "market", "submarket", "hotelClass", "scale", "ownerName", "ownerContact", "ownerPhone", "yearBuilt", "source"];
const byId = new Map(after.features.map((f) => [f.properties.id, f]));
const problems = [];
for (const f of before.features) {
  const p = f.properties;
  const a = byId.get(p.id);
  if (!a) { problems.push(`id ${p.id} (${p.name}) is gone`); continue; }
  for (const k of KEEP) {
    if (JSON.stringify(p[k]) !== JSON.stringify(a.properties[k])) problems.push(`id ${p.id} ${k}: ${JSON.stringify(p[k])} -> ${JSON.stringify(a.properties[k])}`);
  }
  if (JSON.stringify(f.geometry) !== JSON.stringify(a.geometry)) problems.push(`id ${p.id} (${p.name}) moved`);
  if (p.source === "comptroller" && !history[p.id]) problems.push(`id ${p.id} (${p.name}) has no history entry`);
}
const ids = after.features.map((f) => f.properties.id);
if (new Set(ids).size !== ids.length) problems.push("duplicate ids");

const beforeIds = new Set(before.features.map((f) => f.properties.id));
const added = after.features.filter((f) => !beforeIds.has(f.properties.id));
const owners = (g) => g.features.filter((f) => f.properties.owner).length;
const withT12 = (g) => g.features.filter((f) => f.properties.revpar != null).length;
const lastMonth = (g) => {
  const c = {};
  for (const f of g.features) if (f.properties.lastMonth) c[f.properties.lastMonth] = (c[f.properties.lastMonth] ?? 0) + 1;
  return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0];
};
console.log(`features: ${before.features.length} -> ${after.features.length} (added ${added.length})`);
console.log(`last month: ${lastMonth(before)} -> ${lastMonth(after)}`);
console.log(`with T12 RevPAR: ${withT12(before)} -> ${withT12(after)}`);
console.log(`cleaned owner-LLC names (owner prop): ${owners(before)} -> ${owners(after)}`);
for (const f of added.slice(0, 50)) console.log(`  + ${f.properties.id} ${f.properties.name}, ${f.properties.address}, ${f.properties.city} (${f.properties.rooms} rooms)`);

// Spot check: last-month RevPAR recomputed from the month file the map's
// "last month" came from (the newest COMPLETE month, not always the newest file).
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const lm = lastMonth(after)?.match(/^([A-Za-z]{3}) (\d{4})$/);
const latest = fs.readdirSync("data/periods")
  .map((file) => { const m = file.match(/^(\d{4})-([A-Za-z]{3})[A-Za-z]*\.csv$/); return m ? { file, y: +m[1], m: MONTHS.indexOf(m[2].toUpperCase()) } : null; })
  .filter((x) => x && x.m >= 0 && lm && x.y === +lm[2] && x.m === MONTHS.indexOf(lm[1].toUpperCase()))
  .at(0);
if (latest) {
  const days = new Date(Date.UTC(latest.y, latest.m + 1, 0)).getUTCDate();
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = (a, c, z) => `${norm(a)}|${norm(c)}|${String(z ?? "").trim().slice(0, 5)}`;
  const rev = new Map();
  for (const r of parse(fs.readFileSync(`data/periods/${latest.file}`, "utf8"), { columns: (h) => h.map((x) => x.trim()), relax_column_count: true, relax_quotes: true, trim: true })) {
    const k = key(r["Location Address"], r["Location City"], r["Location Zip"]);
    rev.set(k, (rev.get(k) ?? 0) + (Number(String(r["Revenue"] ?? "").replace(/[^0-9.\-]/g, "")) || 0));
  }
  const sample = after.features.filter((f) => f.properties.lastMonthRevpar != null);
  console.log(`\nspot check vs ${latest.file} (revenue / rooms / ${days}):`);
  let bad = 0;
  for (let i = 0; i < 10 && sample.length; i++) {
    const p = sample[Math.floor(((i + 0.5) * sample.length) / 10)].properties;
    const r = rev.get(key(p.address, p.city, p.zip));
    const calc = r != null ? Math.round((r / (p.rooms * days)) * 100) / 100 : null;
    const ok = calc != null && Math.abs(calc - p.lastMonthRevpar) < 0.02;
    if (!ok) bad++;
    const h = history[p.id];
    console.log(`  ${ok ? "ok " : "BAD"} ${p.name} (${p.rooms} rms): last-month $${p.lastMonthRevpar} (file: $${calc}), T12 $${h?.t12Revpar ?? "n/a"}`);
  }
  if (bad) problems.push(`${bad} of 10 spot checks off`);
}

if (problems.length) {
  console.log(`\n✖ ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.log("  " + p);
  process.exit(1);
}
console.log("\n✔ no ids, names, owners, enrichment or coordinates lost");
