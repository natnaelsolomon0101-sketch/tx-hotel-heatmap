import { HotelFeature } from "./types";

/**
 * Hotel brand families recognized from name patterns.
 * Maps brand name to a canonical brand key.
 */
const BRAND_PATTERNS: Record<string, RegExp[]> = {
  hilton: [/hilton(?:express)?/i, /doubletree/i, /hampton/i, /homewood/i],
  marriott: [/marriott/i, /ritz-carlton/i, /st\. regis/i, /w\s+hotel/i, /sheraton/i, /westin/i],
  ihg: [/holiday\s+inn/i, /express\s+by/i, /voco/i, /indigo/i, /candlewood/i],
  wyndham: [/wyndham/i, /la\s+quinta/i, /days\s+inn/i, /super\s+8/i, /ramada/i, /travelodge/i],
  choice: [/choice\s+hotel/i, /comfort\s+inn/i, /comfort\s+suites/i, /quality\s+inn/i, /clarion/i, /econo\s+lodge/i],
  "best-western": [/best\s+western/i],
  "motel-6": [/motel\s+6/i, /red\s+roof/i],
  "extended-stay": [/extended\s+stay/i, /stays/i],
  independent: [/independent/i],
};

export type BrandKey = keyof typeof BRAND_PATTERNS | "other";

export const BRAND_LABELS: Record<BrandKey, string> = {
  hilton: "Hilton",
  marriott: "Marriott",
  ihg: "IHG (Holiday Inn)",
  wyndham: "Wyndham",
  choice: "Choice (Comfort/Quality)",
  "best-western": "Best Western",
  "motel-6": "Motel 6 / Red Roof",
  "extended-stay": "Extended Stay",
  independent: "Independent",
  other: "Other brands",
};

/**
 * Parse a hotel name to detect brand affiliation.
 * Returns the canonical brand key or "other".
 */
export function detectBrand(name: string): BrandKey {
  for (const [brand, patterns] of Object.entries(BRAND_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(name)) return brand as BrandKey;
    }
  }
  return "other";
}

/**
 * Count hotels by brand across a set of features.
 * Returns a map of brand key → count.
 */
export function countBrands(
  features: HotelFeature[]
): Record<BrandKey, number> {
  const counts: Record<BrandKey, number> = {
    hilton: 0,
    marriott: 0,
    ihg: 0,
    wyndham: 0,
    choice: 0,
    "best-western": 0,
    "motel-6": 0,
    "extended-stay": 0,
    independent: 0,
    other: 0,
  };
  for (const f of features) {
    const brand = detectBrand(f.properties.name);
    counts[brand]++;
  }
  return counts;
}
