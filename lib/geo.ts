// Small geo helpers for trade-area (radius) tooling. Pure functions, no
// google.maps dependency, so they are SSR-safe and unit-testable.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.7613;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points, in statute miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when (lat,lng) falls within `radiusMiles` of the circle center. */
export function pointInCircle(
  lat: number,
  lng: number,
  center: LatLng,
  radiusMiles: number
): boolean {
  return haversineMiles(center.lat, center.lng, lat, lng) <= radiusMiles;
}

/** Radius presets (statute miles) offered by the trade-area stepper. */
export const RADIUS_STEPS = [0.5, 1, 3, 5, 10] as const;
export type RadiusStep = (typeof RADIUS_STEPS)[number];

/**
 * Ray-casting point-in-polygon test. `point` is [lng, lat] (matching GeoJSON
 * coordinate order). `ring` is an ordered list of [lng, lat] vertices treated
 * as closed — the last vertex connects back to the first, so callers need not
 * repeat the opening point. Returns false for degenerate rings (<3 vertices).
 * Behavior exactly on an edge is unspecified, which is fine for "hotels inside
 * a drawn area".
 */
export function pointInPolygon(
  point: [number, number],
  ring: [number, number][]
): boolean {
  if (ring.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Approximate polygon area in square miles via an equirectangular projection
 * of lng/lat to local miles, then the shoelace formula. Accurate enough for a
 * submarket-scale "~X sq mi" readout, not for survey work. `ring` is [lng,lat].
 */
export function polygonAreaSqMi(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((acc, [, lat]) => acc + lat, 0) / ring.length;
  const miPerDegLat = (Math.PI / 180) * EARTH_RADIUS_MILES;
  const miPerDegLng = miPerDegLat * Math.cos(toRad(lat0));
  const pts = ring.map(([lng, lat]) => [lng * miPerDegLng, lat * miPerDegLat]);
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(area / 2);
}
