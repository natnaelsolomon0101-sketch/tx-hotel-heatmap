"use client";

import { useEffect, useRef } from "react";

import { Bucket } from "@/lib/types";
import { SortKey } from "@/components/PropertyList";
import { LayerMode } from "@/components/ToolRail";

// ---------------------------------------------------------------------------
// Shareable URL state.
//
// Serializes a small slice of the app's view state to/from URLSearchParams so a
// link reproduces the same filtered view. Deliberately omits map center/zoom to
// keep links stable and short. All helpers are pure; the hook is SSR-safe (it
// guards `window`) and only writes via history.replaceState — never navigates.
// ---------------------------------------------------------------------------

export interface UrlState {
  /** Active RevPAR buckets (csv in the URL). */
  buckets: Bucket[];
  /** Active map layer. */
  layer: LayerMode;
  /** Index into the app's MAP_TYPES array. */
  mapType: number;
  /** Property-list sort key. */
  sort: SortKey;
  /** Search query. */
  q: string;
}

const ALL_BUCKETS: Bucket[] = ["red", "yellow", "gray"];
const LAYERS: LayerMode[] = ["pins", "heatmap"];
const SORTS: SortKey[] = [
  "revpar-desc",
  "revpar-asc",
  "rooms-desc",
  "name-asc",
];

const PARAM = {
  buckets: "buckets",
  layer: "layer",
  mapType: "mt",
  sort: "sort",
  q: "q",
} as const;

function isBucket(v: string): v is Bucket {
  return (ALL_BUCKETS as string[]).includes(v);
}

/**
 * Serialize view state to a query string (without a leading `?`). Only fields
 * that differ from a clean default are emitted so shared links stay short and
 * an unmodified view produces an empty string.
 */
export function encodeState(state: UrlState): string {
  const sp = new URLSearchParams();

  // Only encode buckets when they're a real subset (not all selected).
  if (
    state.buckets.length > 0 &&
    state.buckets.length < ALL_BUCKETS.length
  ) {
    const ordered = ALL_BUCKETS.filter((b) => state.buckets.includes(b));
    sp.set(PARAM.buckets, ordered.join(","));
  }

  if (state.layer && state.layer !== "pins") {
    sp.set(PARAM.layer, state.layer);
  }

  if (state.mapType && state.mapType > 0) {
    sp.set(PARAM.mapType, String(state.mapType));
  }

  if (state.sort && state.sort !== "revpar-desc") {
    sp.set(PARAM.sort, state.sort);
  }

  const q = state.q?.trim();
  if (q) {
    sp.set(PARAM.q, q);
  }

  return sp.toString();
}

/**
 * Parse a query string (with or without a leading `?`, or a full
 * URLSearchParams) into a partial state. Invalid/unknown values are dropped so
 * callers can safely spread the result over their defaults.
 */
export function decodeState(
  search: string | URLSearchParams
): Partial<UrlState> {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;

  const out: Partial<UrlState> = {};

  const rawBuckets = sp.get(PARAM.buckets);
  if (rawBuckets != null) {
    const buckets = rawBuckets
      .split(",")
      .map((s) => s.trim())
      .filter(isBucket);
    // De-dupe while preserving canonical order.
    const uniq = ALL_BUCKETS.filter((b) => buckets.includes(b));
    if (uniq.length > 0) out.buckets = uniq;
  }

  const layer = sp.get(PARAM.layer);
  if (layer != null && (LAYERS as string[]).includes(layer)) {
    out.layer = layer as LayerMode;
  }

  const mt = sp.get(PARAM.mapType);
  if (mt != null) {
    const n = Number.parseInt(mt, 10);
    if (Number.isInteger(n) && n >= 0) out.mapType = n;
  }

  const sort = sp.get(PARAM.sort);
  if (sort != null && (SORTS as string[]).includes(sort)) {
    out.sort = sort as SortKey;
  }

  const q = sp.get(PARAM.q);
  if (q != null) {
    const trimmed = q.trim();
    if (trimmed) out.q = trimmed;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Human-readable view summary.
// ---------------------------------------------------------------------------

const BUCKET_SHORT: Record<Bucket, string> = {
  red: "Top",
  yellow: "Mid",
  gray: "Bottom",
};

const SORT_LABELS: Record<SortKey, string> = {
  "revpar-desc": "RevPAR high→low",
  "revpar-asc": "RevPAR low→high",
  "rooms-desc": "most rooms",
  "name-asc": "name A→Z",
};

const usd0 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

/**
 * Build a plain-text, one-line description of the current filtered view —
 * suitable for pasting into a deal note or chat. Pure (no DOM). Only mentions a
 * dimension when it's actually narrowed from the data-driven full span, so an
 * unfiltered view reads simply "TX hotels · all buckets · N properties".
 *
 * @param state    the current serializable view state
 * @param ranges   the data-driven full bounds { revpar:[lo,hi], rooms:[lo,hi] }
 * @param current  the live slider values { revpar:[lo,hi], rooms:[lo,hi] }
 * @param count    number of properties currently in scope
 */
export function describeView(
  state: UrlState,
  ranges: { revpar: [number, number]; rooms: [number, number] },
  current: { revpar: [number, number]; rooms: [number, number] },
  count: number
): string {
  const parts: string[] = ["TX hotels"];

  const [rpLo, rpHi] = current.revpar;
  if (rpLo > ranges.revpar[0] || rpHi < ranges.revpar[1]) {
    parts.push(`RevPAR ${usd0(rpLo)}–${usd0(rpHi)}`);
  }

  const [rmLo, rmHi] = current.rooms;
  if (rmLo > ranges.rooms[0] || rmHi < ranges.rooms[1]) {
    parts.push(`${Math.round(rmLo).toLocaleString()}–${Math.round(rmHi).toLocaleString()} rooms`);
  }

  if (
    state.buckets.length > 0 &&
    state.buckets.length < ALL_BUCKETS.length
  ) {
    const labels = ALL_BUCKETS.filter((b) => state.buckets.includes(b)).map(
      (b) => BUCKET_SHORT[b]
    );
    parts.push(`buckets: ${labels.join("+")}`);
  }

  const q = state.q?.trim();
  if (q) parts.push(`“${q}”`);

  if (state.layer === "heatmap") parts.push("heatmap");

  if (state.sort && state.sort !== "revpar-desc") {
    parts.push(`sorted ${SORT_LABELS[state.sort]}`);
  }

  parts.push(
    `${count.toLocaleString()} ${count === 1 ? "property" : "properties"}`
  );

  return parts.join(" · ");
}

/** Read the current URL's query into a partial state. SSR-safe (returns {}). */
export function readUrlState(): Partial<UrlState> {
  if (typeof window === "undefined") return {};
  return decodeState(window.location.search);
}

/**
 * Hook: hydrate-on-mount + write-on-change.
 *
 * - On mount, calls `onHydrate` once with the decoded URL state (if non-empty)
 *   so the caller can seed its React state from a shared link.
 * - Whenever `state` changes thereafter, writes a debounced, navigation-free
 *   update to the address bar via history.replaceState. The very first run
 *   (the mount) never writes, so we don't clobber the incoming URL before the
 *   caller has applied the hydrated values.
 *
 * SSR-safe: all DOM access is guarded behind `typeof window`.
 */
export function useUrlState(
  state: UrlState,
  onHydrate?: (partial: Partial<UrlState>) => void,
  debounceMs = 300
) {
  const hydratedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once, before any write.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;
    const partial = decodeState(window.location.search);
    if (Object.keys(partial).length > 0) onHydrate?.(partial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write (debounced) on every subsequent state change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Skip the initial render: we don't want to overwrite the URL we just read.
    if (!hydratedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const qs = encodeState(state);
      const url =
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(window.history.state, "", url);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, debounceMs]);
}
