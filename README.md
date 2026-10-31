# TX Hotel Heatmap

A full-screen CRE mapping tool that plots Texas hotels by **RevPAR** (revenue per
available room), built from Texas Comptroller hotel-occupancy-tax data. Hotels are
bucketed red / yellow / gray by RevPAR percentile and rendered as clustered colored
pins or a RevPAR-weighted density heatmap.

The map needs **no API key**: MapLibre GL renders Esri's free ArcGIS Online tiles
(World Topo Map, World Imagery for satellite). The on-map attribution badge is off;
the footer carries "Basemap: Esri."

![stack](https://img.shields.io/badge/Next.js-14-black) ![stack](https://img.shields.io/badge/MapLibre-GL-blue) ![stack](https://img.shields.io/badge/deck.gl-9-green)

## Features

- **Full-screen MapLibre map** centered on Texas (Map / Satellite), with
  deck.gl pins and zoom-aware grid clustering.
- **Colored markers by RevPAR bucket** — red (top third), yellow (middle third),
  gray (bottom third + missing data). Points cluster when zoomed out and expand
  on click.
- **Property card** — click any hotel for a CRE-style card: photo, name, address,
  `{rooms} Rooms · Hospitality`, RevPAR, ADR, and occupancy.
- **Heatmap layer** — the left-rail *Layers* button toggles between colored pins
  and a MapLibre density heatmap weighted by RevPAR.
- **Filter + legend** — the legend doubles as a filter: tap a bucket to show only
  red / yellow / gray hotels.
- **Tool rail** — Location (recenter), Polygon, Radius, Layers, Map type. Zoom and
  compass controls sit bottom-right.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # optional keys (geocoding, lead sinks)
npm run build-data                 # generates public/hotels.geojson
npm run dev                        # http://localhost:3000
```

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `GOOGLE_GEOCODING_API_KEY` | `build-data` script only | Rooftop geocoding via the **Geocoding API**. Server-side only; can be the same key or a separate IP-restricted one. Falls back to the free US Census geocoder if unset. |


## Data pipeline

`/data/hotels.csv` is the input file — drop the Box **"Texan Hotel Analytics"**
export there (the Texas Comptroller hotel-occupancy-tax CSV: taxpayer + location
columns, `Rooms`, `Revenue`, `RevPAR`). Then:

```bash
npm run build-data
```

`scripts/build-data.ts`:

1. **Parses** `data/hotels.csv`, resolving columns by name so it tolerates other
   export shapes (hotel name, address, city, state, zip, rooms, room revenue, and
   ADR/occupancy if present).
2. **Computes RevPAR** — uses the `RevPAR` column when present, otherwise derives
   `revenue / (rooms × daysInPeriod)`. Rows missing key inputs are `flagged`.
3. **Geocodes** any hotel without lat/lng and caches results (per-geocoder cache
   file) so reruns never re-hit the API. Geocoders:
   - **Google** (default when a Google key is set) — rooftop accuracy via the
     Geocoding API. Pins land on the actual building.
   - **Mapbox** (`GEOCODER=mapbox`) — via the Mapbox Geocoding API (needs a token).
   - **US Census batch** (`GEOCODER=census`) — free, no key, but street-level
     (interpolated); pins can be ~100m–1km off.
4. **Buckets** every hotel red / yellow / gray by RevPAR percentile across the
   portfolio (top third red, middle yellow, bottom third + no-data gray).
5. **Writes** `public/hotels.geojson` with `name, address, rooms, revpar, adr,
   occupancy, revenue, bucket, photo, flagged` properties.

All thresholds live in a `CONFIG` object at the top of the script:

```ts
const CONFIG = {
  daysInPeriod: 31,
  bucketPercentiles: { red: 0.6667, yellow: 0.3333 }, // tune the red/yellow cutoffs
  stateFilter: "TX",
  // ...
};
```

Useful flags:

```bash
npm run build-data                        # Google if a key is set, else Census
GEOCODER=census npm run build-data        # force the free Census geocoder
npm run build-data -- --google            # force Google (rooftop)
npm run build-data -- --limit 200         # only the first 200 rows (quick test)
npm run build-data -- --no-geocode        # use the cache only, skip API calls
npm run build-history                     # recompute RevPAR + trend from data/periods/
```

`build-history` is the source of truth for RevPAR. It reads the per-period
Comptroller files in `data/periods/` and writes two **per-night** figures:

- **T12 RevPAR** = trailing-12-month revenue ÷ rooms ÷ 365 (last four complete
  quarters). This is the headline metric the heatmap buckets, filters, and
  sorts on (`properties.revpar`).
- **Last-month RevPAR** = the latest reported month's revenue ÷ rooms ÷
  days-in-month (`properties.lastMonthRevpar`).

Run `build-data` first (geocoding + base geojson), then `build-history` to lay
the correct RevPAR on top. **Don't re-run `build-data` on the live map:** it
rebuilds every feature from scratch and would drop the hand-fixed hotel names,
owner/brand enrichment and feature ids. Use the monthly refresh below.

### Monthly refresh (new Comptroller months)

Property-level hotel tax receipts are not on a public site (Tax Code §156.155).
They are downloaded from the Comptroller's SIFT site
(https://data-secure.comptroller.texas.gov, login required).

```bash
# 1. Convert the SIFT download into data/periods/YYYY-MON.csv
#    (save .xlsx as CSV first). It prints the column mapping it used and, when
#    the download overlaps a month already on file, which receipts column
#    matches it to the dollar.
npm run convert-sift -- ~/Downloads/<sift-download>.csv

# 2. Add hotels that are new in those months, then recompute RevPAR/history.
npm run update-data
```

- **Periods are discovered from the files.** T12 = the last four complete,
  consecutive quarters on file; "last month" = the newest month file; the
  header's data month follows the data. No constants to edit.
- **Existing hotels are never renumbered or rewritten.** Ids (which history,
  watchlists and shared links key on), cleaned names, `owner`, brand
  enrichment and coordinates carry forward. Hotels are matched by normalized
  address + city + ZIP, the key the map was built on.
- **New hotels** (`add-new-hotels`): > 10 rooms, Texas, not a tax rollup, not
  already on the map. Placed from the local OSM hotel gazetteer
  (`OSM_GAZETTEER`, default `~/hoteladdr/osm/TX.json`) when a lodging POI
  with a matching name is near the Census address point, else from an exact
  US Census match. Anything less certain is left off the map and listed in
  `data/update-report.json` with the reason. Owner-entity names get the same
  cleanup as the July fix (`... DBA MOTEL 6` becomes `MOTEL 6`; the entity is
  kept in `owner`). A new hotel shows gray until it has four quarters for T12.
- A hotel with no filing in the newest month keeps its pin and T12; its
  last-month figures are blank rather than stale. When the newest month closes
  a quarter, quarterly filers' whole-quarter totals are kept out of last-month
  figures.

### Notes on this dataset

- The Comptroller files report revenue **per period** — a single month for the
  monthly files, a quarter for the quarterly files — but their `RevPAR` column
  always divides by 90 days. `build-history` ignores that column and recomputes
  RevPAR per night from the raw revenue on the correct day count.
- The export has **no ADR, occupancy, lat/lng, or photo** columns — those render
  as "n/a"/no-photo. The pipeline still supports them for richer exports.
- `data/hotels.csv` and `data/geocache.json` are git-ignored (large / owner PII).
  The generated `public/hotels.geojson` **is** committed so Vercel renders without
  needing a geocoding step at deploy time.

## Deploy (Vercel)

This repo is set up for Vercel auto-deploy: push to `main` and Vercel builds and
deploys. The map itself needs no environment variables.

## Tech

Next.js 14 (App Router, TypeScript) · Tailwind CSS · MapLibre GL + Esri tiles ·
deck.gl (`@deck.gl/mapbox` MapboxOverlay) · `tsx` for the data pipeline.
