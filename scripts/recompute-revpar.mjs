/**
 * recompute-revpar.mjs — fix RevPAR in public/hotels.geojson IN PLACE.
 *
 * RevPAR = monthly revenue per room = revenue / rooms (the data period is one
 * month, May 2026). The source Comptroller "RevPAR" column divides by ~90 days
 * even on monthly revenue, so it read ~3x low and mixed bases with the /31
 * fallback. We recompute from revenue + rooms directly, then re-bucket by the
 * same tertile rule. No geocoding — coordinates/photos are untouched.
 *
 *   node scripts/recompute-revpar.mjs
 */
import fs from "node:fs";

const GEOJSON = "public/hotels.geojson";
const MIN_ROOMS = 2; // 1-room filings are placeholders, not real counts
const MAX_REVPAR = 20000; // monthly $/room ceiling (~$650/night) — rejects data errors
const RED_P = 0.6667; // top third
const YELLOW_P = 0.3333; // middle third

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));

let nulled = 0;
for (const f of geo.features) {
  const p = f.properties;
  const rooms = Number(p.rooms) || 0;
  const revenue = p.revenue;
  let revpar = null;
  if (rooms >= MIN_ROOMS && revenue != null && revenue > 0) {
    revpar = revenue / rooms;
    if (revpar > MAX_REVPAR) {
      revpar = null; // implausible (vacation-rental aggregators, bad room counts)
      nulled++;
    }
  }
  p.revpar = revpar == null ? null : Math.round(revpar);
}

// Re-bucket by tertiles of the new RevPAR distribution.
const vals = geo.features
  .map((f) => f.properties.revpar)
  .filter((v) => v != null && v > 0)
  .sort((a, b) => a - b);
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

const median = vals[Math.floor(vals.length / 2)];
const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
console.log("=== RevPAR recomputed (monthly $/room) ===");
console.log(`hotels with RevPAR:  ${vals.length.toLocaleString()}`);
console.log(`nulled by $${MAX_REVPAR} cap: ${nulled.toLocaleString()}`);
console.log(`median RevPAR:       $${median.toLocaleString()}/mo`);
console.log(`avg RevPAR:          $${avg.toLocaleString()}/mo`);
console.log(`bucket cutoffs:      yellow >= $${Math.round(yellowCut)}, red >= $${Math.round(redCut)}`);
console.log(`buckets:             red ${tally.red}  yellow ${tally.yellow}  gray ${tally.gray}`);
