import { CompsetPeer, CompsetResult, HotelFeature } from "./types";
import { haversineMiles } from "./geo";
import { percentileRank } from "./percentile";
import { median } from "./stats";

// Ordered scale ladder, coarsest (Economy) to most premium (Luxury). A peer is
// "adjacent" when its rung is within +/-1 of the subject's rung.
const SCALE_LADDER = [
  "economy",
  "midscale",
  "upper midscale",
  "upscale",
  "upper upscale",
  "luxury",
] as const;

const DEFAULT_RADIUS_MI = 5;
const DEFAULT_MAX_PEERS = 12;
const REVPAR_TIER_TOLERANCE = 0.4; // +/-40% RevPAR band for the radius fallback.

// Rooms bands for the radius fallback's "similar size" test.
const ROOMS_BAND_EDGES = [75, 150, 300] as const;

/** Normalize a scale/hotelClass label into a ladder rung index, or null when
 *  unknown/missing (e.g. "Independent", null, or an unrecognized string). */
function scaleRung(...labels: (string | null | undefined)[]): number | null {
  for (const label of labels) {
    if (label == null) continue;
    let key = label.trim().toLowerCase().replace(/\s+/g, " ");
    if (key.endsWith(" class")) key = key.slice(0, -" class".length);
    const idx = SCALE_LADDER.indexOf(key as (typeof SCALE_LADDER)[number]);
    if (idx !== -1) return idx;
  }
  return null;
}

/** Normalize a submarket string for stable equality. */
function submarketKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Bucket a rooms count into a size band index; null when rooms is missing. */
function roomsBand(rooms: number | null | undefined): number | null {
  if (rooms == null || Number.isNaN(rooms)) return null;
  let band = 0;
  for (const edge of ROOMS_BAND_EDGES) {
    if (rooms >= edge) band += 1;
  }
  return band;
}

interface Candidate {
  feature: HotelFeature;
  distanceMi: number | null;
  rung: number | null;
}

function distanceBetween(a: HotelFeature, b: HotelFeature): number | null {
  const [aLng, aLat] = a.geometry?.coordinates ?? [];
  const [bLng, bLat] = b.geometry?.coordinates ?? [];
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const d = haversineMiles(aLat, aLng, bLat, bLng);
  return Math.round(d * 100) / 100;
}

function toPeer(c: Candidate): CompsetPeer {
  const p = c.feature.properties;
  return {
    id: p.id ?? -1,
    name: p.name,
    revpar: p.revpar ?? null,
    adr: p.adr ?? null,
    occupancy: p.occupancy ?? null,
    rooms: p.rooms ?? null,
    distanceMi: c.distanceMi,
  };
}

const hasRevpar = (c: Candidate) => c.feature.properties.revpar != null;

/**
 * Build a subject hotel's competitive set.
 *
 * PRIMARY ('submarket-scale'): when the subject has a submarket, peers are
 * other hotels in the SAME submarket whose scale is the same or adjacent
 * (+/-1 rung); candidates with no/unknown scale are kept on the submarket
 * match alone.
 *
 * FALLBACK ('radius-tier'): when the subject has no submarket, peers are
 * hotels within `radiusMi` (default 5) miles that share a similar tier —
 * either the same rooms band OR a RevPAR within +/-40% of the subject.
 *
 * Peers are capped at `maxPeers` (default 12), preferring same-scale /
 * nearest / RevPAR-bearing candidates. Stats are computed over the subject
 * plus the RevPAR-bearing peers.
 */
export function buildCompset(
  subject: HotelFeature,
  all: HotelFeature[],
  opts?: { radiusMi?: number; maxPeers?: number }
): CompsetResult {
  const sp = subject.properties;
  const subjectId = sp.id ?? -1;
  const maxPeers = Math.max(0, opts?.maxPeers ?? DEFAULT_MAX_PEERS);

  const subjectSubmarket = submarketKey(sp.submarket);
  const useSubmarket = subjectSubmarket.length > 0;
  const subjectRevpar = sp.revpar ?? null;

  const isSubject = (f: HotelFeature) =>
    f === subject || (sp.id != null && f.properties.id === sp.id);

  let basis: CompsetResult["basis"];
  let radiusMi: number | null;
  let candidates: Candidate[] = [];

  if (useSubmarket) {
    basis = "submarket-scale";
    radiusMi = null;
    const subjectRung = scaleRung(sp.scale, sp.hotelClass);

    for (const f of all) {
      if (isSubject(f)) continue;
      const cp = f.properties;
      if (submarketKey(cp.submarket) !== subjectSubmarket) continue;
      const rung = scaleRung(cp.scale, cp.hotelClass);
      // Keep when: candidate scale unknown, subject scale unknown, or the two
      // rungs are the same/adjacent (+/-1).
      const scaleOk =
        rung == null ||
        subjectRung == null ||
        Math.abs(rung - subjectRung) <= 1;
      if (!scaleOk) continue;
      candidates.push({ feature: f, distanceMi: distanceBetween(subject, f), rung });
    }

    // Prefer same-scale, then RevPAR-bearing, then nearest.
    candidates.sort((a, b) => {
      const da = a.rung == null || subjectRung == null ? 99 : Math.abs(a.rung - subjectRung);
      const db = b.rung == null || subjectRung == null ? 99 : Math.abs(b.rung - subjectRung);
      if (da !== db) return da - db;
      if (hasRevpar(a) !== hasRevpar(b)) return hasRevpar(a) ? -1 : 1;
      return (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
    });
  } else {
    basis = "radius-tier";
    radiusMi = opts?.radiusMi ?? DEFAULT_RADIUS_MI;
    const subjectRooms = roomsBand(sp.rooms);
    // When the subject has neither rooms nor RevPAR, the tier filter has
    // nothing to compare against, so radius alone qualifies a peer.
    const subjectHasTier = subjectRooms != null || subjectRevpar != null;

    for (const f of all) {
      if (isSubject(f)) continue;
      const cp = f.properties;
      const distanceMi = distanceBetween(subject, f);
      if (distanceMi == null || distanceMi > radiusMi) continue;

      let tierOk = !subjectHasTier;
      const cRooms = roomsBand(cp.rooms);
      if (subjectRooms != null && cRooms != null && cRooms === subjectRooms) {
        tierOk = true;
      }
      if (
        !tierOk &&
        subjectRevpar != null &&
        cp.revpar != null &&
        cp.revpar >= subjectRevpar * (1 - REVPAR_TIER_TOLERANCE) &&
        cp.revpar <= subjectRevpar * (1 + REVPAR_TIER_TOLERANCE)
      ) {
        tierOk = true;
      }
      if (!tierOk) continue;
      candidates.push({
        feature: f,
        distanceMi,
        rung: scaleRung(cp.scale, cp.hotelClass),
      });
    }

    // Prefer nearest, then RevPAR-bearing.
    candidates.sort((a, b) => {
      const dd = (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
      if (dd !== 0) return dd;
      if (hasRevpar(a) !== hasRevpar(b)) return hasRevpar(a) ? -1 : 1;
      return 0;
    });
  }

  const capped = candidates.slice(0, maxPeers);
  const peers = capped.map(toPeer);

  // Stats over the subject + RevPAR-bearing peers. When there are no peers at
  // all, the stat block is null (subjectRevpar/basis still reported).
  const peerRevpars = capped
    .map((c) => c.feature.properties.revpar)
    .filter((v): v is number => v != null);

  let avgRevpar: number | null = null;
  let medianRevpar: number | null = null;
  let avgAdr: number | null = null;
  let avgOccupancy: number | null = null;
  let rank: number | null = null;
  let percentile: number | null = null;

  if (peers.length > 0) {
    const revparSet =
      subjectRevpar != null ? [...peerRevpars, subjectRevpar] : [...peerRevpars];
    if (revparSet.length > 0) {
      avgRevpar = revparSet.reduce((a, b) => a + b, 0) / revparSet.length;
      medianRevpar = median(revparSet);
    }

    const adrSet = [
      ...capped.map((c) => c.feature.properties.adr),
      sp.adr,
    ].filter((v): v is number => v != null);
    if (adrSet.length > 0) {
      avgAdr = adrSet.reduce((a, b) => a + b, 0) / adrSet.length;
    }

    const occSet = [
      ...capped.map((c) => c.feature.properties.occupancy),
      sp.occupancy,
    ].filter((v): v is number => v != null);
    if (occSet.length > 0) {
      avgOccupancy = occSet.reduce((a, b) => a + b, 0) / occSet.length;
    }

    if (subjectRevpar != null) {
      // Rank 1 = highest RevPAR among the subject + RevPAR-bearing peers.
      const greater = peerRevpars.filter((v) => v > subjectRevpar).length;
      rank = greater + 1;

      const sorted = [...peerRevpars, subjectRevpar].sort((a, b) => a - b);
      const pct = percentileRank(subjectRevpar, sorted);
      percentile = pct == null ? null : Math.max(0, Math.min(1, pct / 100));
    }
  }

  return {
    subjectId,
    basis,
    submarket: sp.submarket ?? null,
    scale: sp.scale ?? null,
    hotelClass: sp.hotelClass ?? null,
    radiusMi,
    peers,
    count: peers.length,
    subjectRevpar,
    avgRevpar,
    medianRevpar,
    avgAdr,
    avgOccupancy,
    rank,
    percentile,
  };
}
