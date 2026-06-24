"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "txhh:watchlist:v1";

export interface Watchlist {
  /** Saved feature keys (see featureKey in PropertyList). */
  ids: Set<string>;
  /** Add or remove a key. */
  toggle: (key: string) => void;
  /** Remove all saved keys. */
  clear: () => void;
  /** False during SSR / first paint, true once localStorage has loaded.
   *  Use to gate UI that would otherwise cause a hydration mismatch. */
  isReady: boolean;
}

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // De-dupe + keep only strings.
    return Array.from(
      new Set(parsed.filter((v): v is string => typeof v === "string"))
    );
  } catch {
    return [];
  }
}

function writeStorage(ids: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / quota: degrade silently to in-memory.
  }
}

/** SSR-safe watchlist backed by localStorage. Initializes empty so the
 *  server and first client render match, then hydrates from storage in an
 *  effect. Degrades to in-memory when localStorage is unavailable. */
export function useWatchlist(): Watchlist {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [isReady, setIsReady] = useState(false);

  // Hydrate after mount (client only).
  useEffect(() => {
    setIds(new Set(readStorage()));
    setIsReady(true);
  }, []);

  // Keep storage in sync after hydration. Skip the pre-ready render so we
  // never overwrite saved data with the empty initial set.
  useEffect(() => {
    if (!isReady) return;
    writeStorage(ids);
  }, [ids, isReady]);

  // Cross-tab sync: pick up changes made in other tabs/windows.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIds(new Set(readStorage()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((key: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clear = useCallback(() => setIds(new Set()), []);

  return { ids, toggle, clear, isReady };
}
