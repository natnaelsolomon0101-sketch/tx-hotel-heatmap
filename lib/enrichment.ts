import { HotelFeature, HotelProperties } from "./types";

// ---------------------------------------------------------------------------
// Compset enrichment helpers (brand/class/scale/submarket) surfaced from the
// STR-branded source. Only ~7% of the dataset is enriched, so every helper is
// null-tolerant and the derived filter option lists are always data-driven.
// ---------------------------------------------------------------------------

/**
 * A hotel's STR chain-scale / class tier. `hotelClass` and `scale` carry the
 * same value in the source; prefer `hotelClass` and fall back to `scale`.
 */
export function hotelClassOf(
  p: Pick<HotelProperties, "hotelClass" | "scale">
): string | null {
  return p.hotelClass || p.scale || null;
}

// Canonical STR chain-scale order (luxury → economy) so class chips read as a
// tier ladder rather than by count. Unknown values sort to the end, A→Z.
const CLASS_ORDER = [
  "Luxury",
  "Upper Upscale",
  "Upscale",
  "Upper Midscale",
  "Midscale",
  "Economy",
];

export type Option = { value: string; count: number };

/** Distinct hotel classes present in the set, ordered by chain-scale tier. */
export function countClasses(features: HotelFeature[]): Option[] {
  const m = new Map<string, number>();
  for (const f of features) {
    const c = hotelClassOf(f.properties);
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      const ia = CLASS_ORDER.indexOf(a.value);
      const ib = CLASS_ORDER.indexOf(b.value);
      if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
      return a.value.localeCompare(b.value);
    });
}

/** Distinct submarkets present in the set, ordered by count (desc), then A→Z. */
export function countSubmarkets(features: HotelFeature[]): Option[] {
  const m = new Map<string, number>();
  for (const f of features) {
    const s = f.properties.submarket;
    if (s) m.set(s, (m.get(s) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
