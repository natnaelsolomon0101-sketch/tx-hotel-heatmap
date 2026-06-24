# TX Hotel Heatmap

A full-screen CRE mapping tool that plots Texas hotels by **RevPAR** (revenue per
available room), built from Texas Comptroller hotel-occupancy-tax data. Hotels are
bucketed red / yellow / gray by RevPAR percentile and rendered as clustered colored
pins or a true Mapbox density heatmap.

![stack](https://img.shields.io/badge/Next.js-14-black) ![stack](https://img.shields.io/badge/react--map--gl-7-blue) ![stack](https://img.shields.io/badge/Mapbox%20GL-3-green)

## Features

- **Full-screen Mapbox GL map** centered on Texas (`light-v11`, with Streets &
  Satellite map types).
- **Colored markers by RevPAR bucket** — red (top third), yellow (middle third),
  gray (bottom third + missing data). Points cluster when zoomed out and expand
  on click.
- **Property card** — click any hotel for a CRE-style card: photo, name, address,
  `{rooms} Rooms · Hospitality`, RevPAR, ADR, and occupancy.
- **Heatmap layer** — the left-rail *Layers* button toggles between colored pins
  and a Mapbox density heatmap weighted by RevPAR.
- **Filter + legend** — the legend doubles as a filter: tap a bucket to show only
  red / yellow / gray hotels.
- **Tool rail** — Location (recenter), Polygon, Radius, Layers, Map type. Zoom and
  compass controls sit bottom-right.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in your Mapbox token(s)
npm run build-data                 # generates public/hotels.geojson
npm run dev                        # http://localhost:3000
```

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | browser (build + runtime) | Renders the Mapbox GL map. Must be a **public** token (`pk.…`). |
| `MAPBOX_GEOCODING_TOKEN` | `build-data` script only | Token for the Mapbox Geocoding API. Can be the same public token. |

> **On Vercel:** add both as Project → Settings → Environment Variables.
> `NEXT_PUBLIC_MAPBOX_TOKEN` must be set for **Production** (and Preview) so the
> deployed map renders. Without it the app shows a "Mapbox token missing" notice.

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
3. **Geocodes** any hotel without lat/lng and caches results to
   `data/geocache.json`, so reruns never re-hit the API. Two geocoders:
   - **Mapbox** (default when a token is set) — per the spec, via the Mapbox
     Geocoding API.
   - **US Census batch** (`GEOCODER=census`) — free, no key; handy for a first
     pass without a token.
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
GEOCODER=census npm run build-data        # force the free Census geocoder
npm run build-data -- --limit 200         # only the first 200 rows (quick test)
npm run build-data -- --no-geocode        # use the geocache only, skip API calls
```

### Notes on this dataset

- The source is **monthly** Texas Comptroller data, so `RevPAR` here is *period
  revenue ÷ available rooms* (monthly), not a nightly figure.
- The export has **no ADR, occupancy, lat/lng, or photo** columns — those render
  as "—"/no-photo. The pipeline still supports them for richer exports.
- `data/hotels.csv` and `data/geocache.json` are git-ignored (large / owner PII).
  The generated `public/hotels.geojson` **is** committed so Vercel renders without
  needing a geocoding step at deploy time.

## Deploy (Vercel)

This repo is set up for Vercel auto-deploy: push to `main` and Vercel builds and
deploys. Before the first deploy, add `NEXT_PUBLIC_MAPBOX_TOKEN` (and
`MAPBOX_GEOCODING_TOKEN` if you'll regenerate data on Vercel) under the project's
Environment Variables.

## Tech

Next.js 14 (App Router, TypeScript) · Tailwind CSS · react-map-gl + mapbox-gl ·
`tsx` for the data pipeline.
