import { HotelFeature } from "./types";

/**
 * Hotel brand families recognized from name patterns.
 * Maps brand name to a canonical brand key.
 */
const BRAND_PATTERNS: Record<string, RegExp[]> = {
  hilton: [
    /hilton(?:\s+express)?/i, /doubletree/i, /hampton/i, /homewood/i, /embassy\s+suites/i,
    /home2/i, /\bcanopy\b/i, /spark\s+by/i, /tru\s+by\s+hilton/i, /tapestry\s+collection/i,
    /\bcurio\b/i, /waldorf\s+astoria/i, /conrad\s+(?:hotel|by|san|austin|dallas|houston)/i,
    /\bmotto\s+by/i, /\bsignia\b/i, /tempo\s+by/i,
  ],
  marriott: [
    // Legacy luxury/premium brands
    /marriott/i, /ritz[- ]carlton/i, /st\.?\s+regis/i, /\bw\s+hotel/i, /sheraton/i, /westin/i,
    // Select-service & extended-stay brands (Courtyard, Fairfield, Residence Inn, etc.)
    /courtyard/i, /fairfield/i, /residence\s+inn/i, /springhill/i, /towneplace/i, /\bac\s+hotel/i,
    /\baloft/i, /\belement\b/i, /renaissance/i, /\bmoxy/i, /four\s+points/i, /le\s+m[eé]ridien/i,
    /autograph/i, /tribute/i, /delta\s+hotel/i, /gaylord/i, /\bedition\b/i, /jw\s+marriott/i,
  ],
  ihg: [
    /holiday\s+inn/i, /express\s+by/i, /\bvoco\b/i, /hotel\s+indigo/i, /candlewood/i,
    /crowne\s+plaza/i, /staybridge/i, /avid\s+hotel/i, /kimpton/i, /even\s+hotel/i,
    /intercontinental/i,
  ],
  wyndham: [
    /wyndham/i, /la\s+quinta/i, /days\s+inn/i, /super\s+8/i, /ramada/i, /travelodge/i,
    /microtel/i, /baymont/i, /howard\s+johnson/i, /wingate/i, /hawthorn\s+suites/i,
    /echo\s+suites/i, /knights\s+inn/i, /americinn/i, /\btryp\b/i,
  ],
  choice: [
    /choice\s+hotel/i, /comfort\s+inn/i, /comfort\s+suites/i, /comfort\s+hotel/i,
    /quality\s+inn/i, /quality\s+suites/i, /quality\s+hotel/i, /clarion/i, /econo\s+lodge/i,
    /sleep\s+inn/i, /main\s?stay/i, /suburban\s+studios/i, /cambria/i, /wood\s?spring/i,
    /everhome/i, /rodeway/i, /\bascend\b/i,
  ],
  "best-western": [/best\s+western/i, /surestay/i, /glo\s+by/i, /\bsadie\b/i, /\baiden\s+by/i],
  "motel-6": [/motel\s+6/i, /red\s+roof/i, /studio\s+6/i],
  "extended-stay": [
    /extended\s+stay/i, /intown\s+suites/i, /siegel\s+suites/i, /crossland/i,
    /sonesta\s+es/i, /hometowne\s+studios/i, /value\s+place/i,
  ],
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
