import test from "node:test";
import assert from "node:assert/strict";

import {
  percentileRank,
  roundPct,
  cityKey,
  percentileDescriptor,
  buildRevparIndex,
  getHotelPercentiles,
} from "./percentile";
import { HotelFeature } from "./types";

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (eps ${eps})`);

test("percentileRank: empty array -> null", () => {
  assert.equal(percentileRank(50, []), null);
});

test("percentileRank: null/NaN value -> null", () => {
  assert.equal(percentileRank(null, [1, 2, 3]), null);
  assert.equal(percentileRank(NaN, [1, 2, 3]), null);
});

test("percentileRank: single-element array (n===1) -> 100", () => {
  assert.equal(percentileRank(42, [42]), 100);
  // Even when the value is not the element, a lone group is the 100th pct.
  assert.equal(percentileRank(999, [42]), 100);
});

test("percentileRank: value below all elements ranks at or below 0 (raw, unclamped)", () => {
  // The raw rank is unclamped; display clamping is roundPct's job.
  const r = percentileRank(5, [10, 20, 30])!;
  assert.ok(r <= 0, `expected <= 0, got ${r}`);
  assert.equal(roundPct(r), 0);
});

test("percentileRank: value above all elements ranks at or above 100 (raw, unclamped)", () => {
  // The raw rank is unclamped; display clamping is roundPct's job.
  const r = percentileRank(40, [10, 20, 30])!;
  assert.ok(r >= 100, `expected >= 100, got ${r}`);
  assert.equal(roundPct(r), 100);
});

test("percentileRank: duplicate run uses the run midpoint, not first index", () => {
  // [10, 10, 20, 20, 20, 30] — the run of 20s spans indices 2..4.
  // first index >= 20 is 2, exclusive upper bound is 5, so midpoint rank
  // is (2 + 5 - 1) / 2 = 3, over (n - 1) = 5 -> 60.
  const sorted = [10, 10, 20, 20, 20, 30];
  close(percentileRank(20, sorted)!, 60);
  // Not the naive "first index" rank of 2/5 = 40.
  assert.notEqual(percentileRank(20, sorted), 40);
});

test("percentileRank: monotonic — higher value never ranks lower", () => {
  const sorted = [10, 10, 20, 20, 20, 30, 45, 60];
  let prev = -Infinity;
  for (const v of [5, 10, 15, 20, 25, 30, 45, 60, 100]) {
    const r = percentileRank(v, sorted)!;
    assert.ok(r >= prev, `rank for ${v} (${r}) dropped below prev (${prev})`);
    prev = r;
  }
});

test("roundPct: clamps to 0..100 and rounds", () => {
  assert.equal(roundPct(-5), 0);
  assert.equal(roundPct(105), 100);
  assert.equal(roundPct(49.6), 50);
  assert.equal(roundPct(0), 0);
  assert.equal(roundPct(100), 100);
});

test("cityKey: trims + lowercases; null/undefined -> ''", () => {
  assert.equal(cityKey("  Austin  "), "austin");
  assert.equal(cityKey("DALLAS"), "dallas");
  assert.equal(cityKey(null), "");
  assert.equal(cityKey(undefined), "");
});

test("percentileDescriptor: bands", () => {
  assert.ok(percentileDescriptor(95)!.startsWith("Top"));
  assert.ok(percentileDescriptor(90)!.startsWith("Top"));
  assert.equal(percentileDescriptor(80), "Upper quartile");
  assert.equal(percentileDescriptor(75), "Upper quartile");
  assert.equal(percentileDescriptor(60), "Above median");
  assert.equal(percentileDescriptor(50), "Above median");
  assert.equal(percentileDescriptor(30), "Below median");
  assert.equal(percentileDescriptor(25), "Below median");
  assert.equal(percentileDescriptor(10), "Bottom quartile");
  assert.equal(percentileDescriptor(0), "Bottom quartile");
});

// Minimal HotelFeature literals: only the fields the index reads are real.
const hotel = (revpar: number | null, city: string): HotelFeature =>
  ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [-97, 30] },
    properties: { revpar, city },
  } as unknown as HotelFeature);

test("buildRevparIndex + getHotelPercentiles", () => {
  const features: HotelFeature[] = [
    hotel(100, "Austin"),
    hotel(200, "Austin"),
    hotel(300, "Dallas"),
    hotel(null, "Dallas"), // null RevPAR — must be excluded
  ];
  const index = buildRevparIndex(features);

  // Null-RevPAR hotel excluded: statewide has 3 entries, sorted ascending.
  assert.deepEqual(index.statewide, [100, 200, 300]);
  assert.deepEqual(index.byCity.get("austin"), [100, 200]);
  // Dallas has one valid RevPAR (the null one dropped out).
  assert.deepEqual(index.byCity.get("dallas"), [300]);

  // Statewide ranks are absolute across all cities.
  close(getHotelPercentiles(100, "Austin", index).statewide!, 0);
  close(getHotelPercentiles(300, "Dallas", index).statewide!, 100);
  close(getHotelPercentiles(200, "Austin", index).statewide!, 50);

  // In-city rank + cityCount for Austin (2 hotels).
  const austin = getHotelPercentiles(200, "Austin", index);
  assert.equal(austin.cityCount, 2);
  close(austin.inCity!, 100); // top of its 2-hotel city

  // Dallas is a lone valid hotel -> n===1 -> inCity 100, cityCount 1.
  const dallas = getHotelPercentiles(300, "Dallas", index);
  assert.equal(dallas.cityCount, 1);
  assert.equal(dallas.inCity, 100);
});
