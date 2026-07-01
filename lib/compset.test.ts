import test from "node:test";
import assert from "node:assert/strict";

import { buildCompset } from "./compset";
import { HotelFeature, HotelProperties } from "./types";

const close = (a: number, b: number, eps = 1e-4) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (eps ${eps})`);

// Minimal HotelFeature builder. Only the fields under test are meaningful; the
// rest are filled with nulls so the literal satisfies HotelProperties.
let seq = 1;
const hotel = (
  props: Partial<HotelProperties>,
  coords: [number, number] = [-97.74, 30.27]
): HotelFeature =>
  ({
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      id: seq++,
      name: `H${seq}`,
      address: "",
      city: "Austin",
      state: "TX",
      zip: "",
      rooms: null,
      revpar: null,
      lastMonthRevpar: null,
      lastMonth: null,
      adr: null,
      occupancy: null,
      revenue: null,
      bucket: "gray",
      photo: null,
      flagged: false,
      ...props,
    },
  } as HotelFeature);

const names = (r: { peers: { name: string }[] }) =>
  new Set(r.peers.map((p) => p.name));

test("submarket-scale: same submarket + same/adjacent scale selected, others excluded", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Downtown", scale: "Upscale" });
  const all = [
    subject,
    hotel({ name: "same", submarket: "Downtown", scale: "Upscale" }),
    hotel({ name: "adjacent", submarket: "Downtown", scale: "Upper Upscale" }),
    hotel({ name: "farScale", submarket: "Downtown", scale: "Economy" }),
    hotel({ name: "otherSubmkt", submarket: "Airport", scale: "Upscale" }),
  ];
  const r = buildCompset(subject, all);
  assert.equal(r.basis, "submarket-scale");
  assert.equal(r.radiusMi, null);
  assert.equal(r.submarket, "Downtown");
  assert.deepEqual(names(r), new Set(["same", "adjacent"]));
  // Subject itself is never a peer.
  assert.ok(!names(r).has("SUBJ"));
});

test("submarket-scale: adjacency is strictly +/-1 rung", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Downtown", scale: "Upscale" });
  const all = [
    subject,
    hotel({ name: "upMid", submarket: "Downtown", scale: "Upper Midscale" }), // -1 rung
    hotel({ name: "upUp", submarket: "Downtown", scale: "Upper Upscale" }), // +1 rung
    hotel({ name: "mid", submarket: "Downtown", scale: "Midscale" }), // -2 rung
    hotel({ name: "lux", submarket: "Downtown", scale: "Luxury" }), // +2 rung
  ];
  const r = buildCompset(subject, all);
  assert.deepEqual(names(r), new Set(["upMid", "upUp"]));
});

test("submarket-scale: candidate with missing scale matches on submarket alone", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Downtown", scale: "Upscale" });
  const all = [
    subject,
    hotel({ name: "noScale", submarket: "Downtown" }), // scale undefined -> allowed
    hotel({ name: "noScaleOther", submarket: "Airport" }), // wrong submarket -> out
  ];
  const r = buildCompset(subject, all);
  assert.deepEqual(names(r), new Set(["noScale"]));
});

test("radius-tier fallback: within radius + similar tier only", () => {
  // Subject has NO submarket -> radius fallback. Subject at (30.27,-97.74),
  // rooms 120 (mid band), revpar 100.
  const subject = hotel(
    { name: "SUBJ", rooms: 120, revpar: 100 },
    [-97.74, 30.27]
  );
  const all = [
    subject,
    // ~0.69 mi away, same rooms band -> in
    hotel({ name: "nearSameRooms", rooms: 110 }, [-97.74, 30.28]),
    // ~0.69 mi away, different rooms band but revpar within +/-40% -> in
    hotel({ name: "nearRevpar", rooms: 600, revpar: 105 }, [-97.74, 30.28]),
    // ~0.69 mi away, different band AND revpar far -> out
    hotel({ name: "nearWrongTier", rooms: 600, revpar: 300 }, [-97.74, 30.28]),
    // same tier but ~6.9 mi away (outside 5 mi) -> out
    hotel({ name: "farSameRooms", rooms: 110 }, [-97.74, 30.37]),
  ];
  const r = buildCompset(subject, all);
  assert.equal(r.basis, "radius-tier");
  assert.equal(r.radiusMi, 5);
  assert.deepEqual(names(r), new Set(["nearSameRooms", "nearRevpar"]));
  // distanceMi is populated on peers.
  for (const p of r.peers) assert.ok(p.distanceMi != null && p.distanceMi < 5);
});

test("radius-tier fallback: respects custom radiusMi", () => {
  const subject = hotel({ name: "SUBJ", rooms: 120 }, [-97.74, 30.27]);
  const all = [
    subject,
    hotel({ name: "near", rooms: 110 }, [-97.74, 30.28]), // ~0.69 mi
  ];
  const tight = buildCompset(subject, all, { radiusMi: 0.5 });
  assert.equal(tight.radiusMi, 0.5);
  assert.equal(tight.count, 0); // 0.69 mi > 0.5 mi radius
  const loose = buildCompset(subject, all, { radiusMi: 1 });
  assert.equal(loose.count, 1);
});

test("stats: rank, percentile, avg + median correctness", () => {
  const subject = hotel({
    name: "SUBJ",
    submarket: "Downtown",
    scale: "Upscale",
    revpar: 200,
    adr: 250,
    occupancy: 0.8,
  });
  const all = [
    subject,
    hotel({ name: "p1", submarket: "Downtown", scale: "Upscale", revpar: 100 }),
    hotel({ name: "p2", submarket: "Downtown", scale: "Upscale", revpar: 300 }),
    hotel({ name: "p3", submarket: "Downtown", scale: "Upscale", revpar: 500 }),
  ];
  const r = buildCompset(subject, all);
  assert.equal(r.count, 3);
  // Set {100,200,300,500}: two peers beat 200 -> rank 3.
  assert.equal(r.rank, 3);
  // percentileRank(200, [100,200,300,500]) = 33.33/100 = 0.3333.
  close(r.percentile!, 1 / 3);
  // avg over subject + revpar peers: (100+300+500+200)/4 = 275.
  close(r.avgRevpar!, 275);
  // median of [100,200,300,500] = 250.
  close(r.medianRevpar!, 250);
  assert.equal(r.subjectRevpar, 200);
});

test("empty peer set: count 0 and all stats null", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Nowhere", scale: "Upscale", revpar: 150 });
  const all = [subject, hotel({ name: "elsewhere", submarket: "Downtown", scale: "Upscale", revpar: 150 })];
  const r = buildCompset(subject, all);
  assert.equal(r.count, 0);
  assert.deepEqual(r.peers, []);
  assert.equal(r.avgRevpar, null);
  assert.equal(r.medianRevpar, null);
  assert.equal(r.avgAdr, null);
  assert.equal(r.avgOccupancy, null);
  assert.equal(r.rank, null);
  assert.equal(r.percentile, null);
  // subjectRevpar is still reported.
  assert.equal(r.subjectRevpar, 150);
});

test("subject without revpar: peers still returned, rank/percentile null", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Downtown", scale: "Upscale", revpar: null });
  const all = [
    subject,
    hotel({ name: "p1", submarket: "Downtown", scale: "Upscale", revpar: 100, adr: 120 }),
    hotel({ name: "p2", submarket: "Downtown", scale: "Upscale", revpar: 200, adr: 220 }),
  ];
  const r = buildCompset(subject, all);
  assert.equal(r.count, 2);
  assert.equal(r.rank, null);
  assert.equal(r.percentile, null);
  assert.equal(r.subjectRevpar, null);
  // Averages still computed from the RevPAR-bearing peers (subject excluded).
  close(r.avgRevpar!, 150);
  close(r.avgAdr!, 170);
});

test("maxPeers caps the peer list, preferring same-scale / has-revpar / nearest", () => {
  const subject = hotel({ name: "SUBJ", submarket: "Downtown", scale: "Upscale" });
  const all: HotelFeature[] = [subject];
  for (let i = 0; i < 20; i++) {
    all.push(hotel({ name: `p${i}`, submarket: "Downtown", scale: "Upscale", revpar: 100 + i }));
  }
  const r = buildCompset(subject, all, { maxPeers: 5 });
  assert.equal(r.count, 5);
  assert.equal(r.peers.length, 5);
});
