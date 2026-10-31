/**
 * publish-geojson.mjs: write the public map file from the full build file.
 *
 * The data pipeline (add-new-hotels, enrich-hotels, build-history, build-data)
 * reads and writes data/hotels.full.geojson, which keeps every field,
 * including the owner fields the pipeline uses for matching. That file is a
 * build input only: nothing under data/ is served.
 *
 * This script copies it to public/hotels.geojson (the file the site serves)
 * with every owner-related property removed.
 *
 *   node scripts/publish-geojson.mjs           # write public/hotels.geojson
 *   node scripts/publish-geojson.mjs --check   # fail if public has owner data
 *                                              # or is out of sync with full
 *
 * `--check` runs as `prebuild`, so a build that would serve owner data fails.
 */
import fs from "node:fs";

const FULL = "data/hotels.full.geojson";
const PUBLIC = "public/hotels.geojson";

// Any property whose name mentions "owner" is stripped, so a future
// enrichment field (ownerEmail, ownerAddress, ...) can't slip through.
const isOwnerKey = (k) => /owner/i.test(k);

function strip(feature) {
  const props = {};
  for (const [k, v] of Object.entries(feature.properties)) {
    if (!isOwnerKey(k)) props[k] = v;
  }
  return { ...feature, properties: props };
}

function publicFrom(full) {
  return { ...full, features: full.features.map(strip) };
}

if (process.argv.includes("--check")) {
  const pub = JSON.parse(fs.readFileSync(PUBLIC, "utf8"));
  const leaks = new Set();
  for (const f of pub.features) {
    for (const k of Object.keys(f.properties)) if (isOwnerKey(k)) leaks.add(k);
  }
  if (leaks.size) {
    console.error(
      `${PUBLIC} contains owner fields (${[...leaks].join(", ")}). ` +
        "Run `npm run publish-geojson` before building."
    );
    process.exit(1);
  }
  if (fs.existsSync(FULL)) {
    const expected = JSON.stringify(
      publicFrom(JSON.parse(fs.readFileSync(FULL, "utf8")))
    );
    if (expected !== JSON.stringify(pub)) {
      console.error(
        `${PUBLIC} is out of sync with ${FULL}. ` +
          "Run `npm run publish-geojson` before building."
      );
      process.exit(1);
    }
  }
  console.log(`${PUBLIC}: ${pub.features.length} features, no owner fields`);
} else {
  const full = JSON.parse(fs.readFileSync(FULL, "utf8"));
  const pub = publicFrom(full);
  fs.writeFileSync(PUBLIC, JSON.stringify(pub));
  console.log(
    `Wrote ${PUBLIC} (${pub.features.length.toLocaleString()} features, ` +
      `owner fields removed) from ${FULL}`
  );
}
