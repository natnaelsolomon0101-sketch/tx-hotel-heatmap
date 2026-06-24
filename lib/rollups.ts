import { HotelFeature } from "./types";
import {
  RollupRow,
  aggregateBy,
  cityKey,
  zipKey,
  MIN_MARKET_SIZE,
  MIN_ZIP_SIZE,
} from "./markets";

// The two dimensions the Rollups panel can group by. County is intentionally
// omitted: HotelProperties carries no county field and it cannot be reliably
// inferred from name/address, so we expose the data we actually have — ZIP and
// City. Both reuse the same aggregateBy/keyFn machinery that powers the Markets
// tab, so RevPAR/median/bucket-share math stays single-sourced in lib/markets.ts.
export type RollupDim = "zip" | "city";

export type RollupSort = "avg" | "count";

/** Aggregate features into per-ZIP rows, sorted by avg RevPAR desc. Thin wrapper
 *  over aggregateBy with the ZIP keyFn; ZIPs use a lower min-size floor than
 *  cities so useful submarkets stay visible. */
export function aggregateZips(
  features: HotelFeature[],
  minSize: number = MIN_ZIP_SIZE
): RollupRow[] {
  return aggregateBy(features, zipKey, minSize);
}

/** Aggregate features into per-City rows, sorted by avg RevPAR desc. Mirrors
 *  aggregateMarkets but returns the generic RollupRow (the `key` IS the city). */
export function aggregateCities(
  features: HotelFeature[],
  minSize: number = MIN_MARKET_SIZE
): RollupRow[] {
  return aggregateBy(features, cityKey, minSize);
}

/** One call that returns whichever dimension the panel currently wants. */
export function aggregateRollup(
  features: HotelFeature[],
  dim: RollupDim
): RollupRow[] {
  return dim === "zip" ? aggregateZips(features) : aggregateCities(features);
}

/** Re-sort an already-aggregated set. aggregateBy returns avg-RevPAR-desc; this
 *  lets the panel offer a count-desc view without re-aggregating. Returns a new
 *  array (does not mutate). Ties on count fall back to avg RevPAR desc. */
export function sortRollup(rows: RollupRow[], by: RollupSort): RollupRow[] {
  const out = [...rows];
  if (by === "count") {
    out.sort((a, b) => b.count - a.count || b.avgRevpar - a.avgRevpar);
  } else {
    out.sort((a, b) => b.avgRevpar - a.avgRevpar || b.count - a.count);
  }
  return out;
}
