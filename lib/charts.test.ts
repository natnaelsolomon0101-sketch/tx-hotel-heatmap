import test from "node:test";
import assert from "node:assert/strict";

import { histogram, niceTicks, DEFAULT_REVPAR_EDGES } from "./charts";

test("histogram([]) -> one bin per default edge, all zero", () => {
  const bins = histogram([]);
  assert.equal(bins.length, DEFAULT_REVPAR_EDGES.length);
  for (const b of bins) assert.equal(b.count, 0);
});

test("histogram: half-open bins [x0, x1) — 25 lands in the 25-bucket", () => {
  const bins = histogram([25]);
  // The "0" bin is [0, 25); 25 must land in the next bin ([25, 50)).
  const zeroBin = bins.find((b) => b.x0 === 0)!;
  const twentyFiveBin = bins.find((b) => b.x0 === 25)!;
  assert.equal(zeroBin.count, 0);
  assert.equal(twentyFiveBin.count, 1);
});

test("histogram: 24.999 falls in the 0-bucket, not the 25-bucket", () => {
  const bins = histogram([24.999]);
  const zeroBin = bins.find((b) => b.x0 === 0)!;
  const twentyFiveBin = bins.find((b) => b.x0 === 25)!;
  assert.equal(zeroBin.count, 1);
  assert.equal(twentyFiveBin.count, 0);
});

test("histogram: huge value lands in the open-ended final bin", () => {
  const bins = histogram([999999]);
  const last = bins[bins.length - 1];
  assert.equal(last.x1, Infinity);
  assert.equal(last.count, 1);
  // No other bin received it.
  const others = bins.slice(0, -1).reduce((s, b) => s + b.count, 0);
  assert.equal(others, 0);
});

test("histogram: counts sum to finite non-null inputs; NaN/null skipped", () => {
  const values = [10, 30, 60, NaN, null as unknown as number, 200, 5000];
  const bins = histogram(values);
  const total = bins.reduce((s, b) => s + b.count, 0);
  // 5 finite values; NaN and null are filtered.
  assert.equal(total, 5);
});

test("histogram: custom unsorted edges still bin correctly", () => {
  // Unsorted on purpose; histogram must normalize internally.
  const edges = [100, 0, 50];
  const bins = histogram([10, 60, 250], edges);
  // After sorting: bins are [0,50), [50,100), [100,∞).
  assert.deepEqual(
    bins.map((b) => b.x0),
    [0, 50, 100]
  );
  assert.deepEqual(
    bins.map((b) => b.count),
    [1, 1, 1] // 10 -> [0,50); 60 -> [50,100); 250 -> [100,∞)
  );
});

test("niceTicks: non-positive / non-finite max -> [0]", () => {
  assert.deepEqual(niceTicks(0), [0]);
  assert.deepEqual(niceTicks(-5), [0]);
  assert.deepEqual(niceTicks(Infinity), [0]);
});

test("niceTicks: clean ascending steps starting at 0 covering max", () => {
  const ticks = niceTicks(100, 4);
  assert.equal(ticks[0], 0);
  assert.ok(
    ticks[ticks.length - 1] >= 100,
    `last tick ${ticks[ticks.length - 1]} should cover max 100`
  );
  for (let i = 1; i < ticks.length; i++) {
    assert.ok(
      ticks[i] > ticks[i - 1],
      `ticks not strictly increasing at ${i}: ${ticks[i - 1]} -> ${ticks[i]}`
    );
  }
});
