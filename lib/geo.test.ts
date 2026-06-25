import test from "node:test";
import assert from "node:assert/strict";

import {
  haversineMiles,
  pointInCircle,
  pointInPolygon,
  polygonAreaSqMi,
  RADIUS_STEPS,
} from "./geo";

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (eps ${eps})`);

test("haversineMiles: point to itself is 0", () => {
  close(haversineMiles(30, -97, 30, -97), 0);
});

test("haversineMiles: ~1 degree of latitude ≈ 69 miles", () => {
  const d = haversineMiles(30, -97, 31, -97);
  assert.ok(Math.abs(d - 69) <= 1, `expected ~69 mi, got ${d}`);
});

test("haversineMiles: symmetry a->b == b->a", () => {
  const ab = haversineMiles(30, -97, 32.5, -96);
  const ba = haversineMiles(32.5, -96, 30, -97);
  close(ab, ba);
});

test("pointInCircle: center is inside any positive radius", () => {
  const center = { lat: 30, lng: -97 };
  assert.equal(pointInCircle(30, -97, center, 0.5), true);
  assert.equal(pointInCircle(30, -97, center, 10), true);
});

test("pointInCircle: clearly-outside point is false", () => {
  const center = { lat: 30, lng: -97 };
  // ~69 miles north, radius only 1 mile.
  assert.equal(pointInCircle(31, -97, center, 1), false);
});

test("pointInCircle: boundary-ish points behave sensibly", () => {
  const center = { lat: 30, lng: -97 };
  const d = haversineMiles(center.lat, center.lng, 30.1, -97);
  // Just inside a radius bigger than the distance, just outside a smaller one.
  assert.equal(pointInCircle(30.1, -97, center, d + 0.1), true);
  assert.equal(pointInCircle(30.1, -97, center, d - 0.1), false);
});

const unitSquare: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
];

test("pointInPolygon: interior point true, exterior false", () => {
  assert.equal(pointInPolygon([0.5, 0.5], unitSquare), true);
  assert.equal(pointInPolygon([2, 2], unitSquare), false);
});

test("pointInPolygon: degenerate ring (<3 vertices) is false", () => {
  assert.equal(pointInPolygon([0.5, 0.5], [[0, 0], [1, 1]]), false);
  assert.equal(pointInPolygon([0.5, 0.5], [[0, 0]]), false);
});

test("polygonAreaSqMi: <3 vertices -> 0", () => {
  assert.equal(polygonAreaSqMi([[0, 0], [1, 1]]), 0);
  assert.equal(polygonAreaSqMi([]), 0);
});

test("polygonAreaSqMi: small square near a known latitude is positive + plausible", () => {
  // ~0.1° square centered near lat 30. 0.1° lat ≈ 6.9 mi; lng shrinks by
  // cos(30) ≈ 0.866, so ~6 mi wide. Area is order ~40 sq mi.
  const square: [number, number][] = [
    [-97.0, 30.0],
    [-97.0, 30.1],
    [-96.9, 30.1],
    [-96.9, 30.0],
  ];
  const area = polygonAreaSqMi(square);
  assert.ok(area > 0, `expected positive area, got ${area}`);
  assert.ok(area > 20 && area < 80, `expected ~40 sq mi, got ${area}`);
});

test("RADIUS_STEPS equals [0.5, 1, 3, 5, 10]", () => {
  assert.deepEqual([...RADIUS_STEPS], [0.5, 1, 3, 5, 10]);
});
