import type { Bucket } from "./types";
import type { Range } from "@/components/RangeFilters";
import type { BrandKey } from "./brands";

// A saved filter view. Captures every user-tunable filter so the exact list
// can be restored later. Lives in localStorage only — session-level
// convenience, never synced to the URL or shared.
export interface FilterPreset {
  name: string;
  buckets: Bucket[];
  revparRange: Range;
  roomsRange: Range;
  activeBrands: Set<BrandKey>;
  query: string;
  createdAt: number;
}

// Serializable form of a preset. Set<BrandKey> doesn't survive JSON.stringify,
// so brands is stored as a plain array and rehydrated on load.
interface StoredPreset {
  name: string;
  buckets: Bucket[];
  revparRange: Range;
  roomsRange: Range;
  activeBrands: BrandKey[];
  query: string;
  createdAt: number;
}

export const PRESETS_KEY = "tx-hotel-heatmap-presets";
export const RECENT_SEARCHES_KEY = "tx-hotel-heatmap-recent-searches";
export const MAX_PRESETS = 10;
export const MAX_RECENT_SEARCHES = 8;

function toStored(p: FilterPreset): StoredPreset {
  return { ...p, activeBrands: Array.from(p.activeBrands) };
}

function fromStored(s: StoredPreset): FilterPreset {
  return { ...s, activeBrands: new Set(s.activeBrands) };
}

export function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(fromStored);
  } catch {
    return [];
  }
}

export function savePresets(presets: FilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify(presets.map(toStored))
    );
  } catch {
    /* ignore storage failures (private mode / quota) */
  }
}

export function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === "string");
  } catch {
    return [];
  }
}

export function saveRecentSearches(searches: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(searches)
    );
  } catch {
    /* ignore storage failures */
  }
}

// Push a search query to the front of the recent list, de-duped (case-
// insensitive) and capped at MAX_RECENT_SEARCHES (oldest dropped).
export function pushRecentSearch(searches: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return searches;
  const next = [q, ...searches.filter((s) => s.toLowerCase() !== q.toLowerCase())];
  return next.slice(0, MAX_RECENT_SEARCHES);
}
