"use client";

import { useEffect, useRef, useState } from "react";
import type { FilterPreset } from "@/lib/presets";

type FilterPresetsProps = {
  presets: FilterPreset[];
  recentSearches: string[];
  // Whether the current filter state differs from defaults (enables Save).
  canSave: boolean;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: FilterPreset) => void;
  onDeletePreset: (createdAt: number) => void;
  onLoadSearch: (query: string) => void;
};

// "Saved views" control: a Save-current-view button plus a dropdown menu
// that restores saved presets and recent searches. Presets persist in
// localStorage (see lib/presets.ts); this is purely the UI surface.
export default function FilterPresets({
  presets,
  recentSearches,
  canSave,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onLoadSearch,
}: FilterPresetsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Close the menu / naming form on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !naming) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setNaming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNaming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, naming]);

  useEffect(() => {
    if (naming) nameInputRef.current?.focus();
  }, [naming]);

  const commitSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setName("");
    setNaming(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center justify-between rounded-2xl bg-white/95 p-2 shadow-card ring-1 ring-black/5 backdrop-blur"
    >
      {naming ? (
        <div className="flex w-full items-center gap-1.5">
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSave();
            }}
            placeholder="Name this view…"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-900 outline-none ring-1 ring-gray-200 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={commitSave}
            disabled={!name.trim()}
            className={`rounded-lg px-2 py-1 text-xs font-medium ${
              name.trim()
                ? "bg-gray-900 text-white hover:bg-gray-700"
                : "bg-gray-200 text-gray-400"
            }`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
            className="rounded-lg px-1.5 py-1 text-xs text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Saved views
            {presets.length > 0 && (
              <span className="rounded-full bg-gray-200 px-1.5 text-[10px] font-semibold text-gray-600">
                {presets.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(true);
              setMenuOpen(false);
            }}
            disabled={!canSave}
            title={
              canSave
                ? "Save the current filters as a view"
                : "Apply some filters to save a view"
            }
            className={`rounded-lg px-2 py-1 text-xs font-medium ${
              canSave
                ? "text-blue-600 hover:bg-blue-50"
                : "text-gray-300"
            }`}
          >
            Save current view
          </button>
        </>
      )}

      {menuOpen && !naming && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[50vh] overflow-y-auto rounded-xl bg-white p-1 shadow-card ring-1 ring-black/10">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Saved views
          </div>
          {presets.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-gray-400">
              No saved views yet.
            </div>
          ) : (
            presets.map((p) => (
              <div
                key={p.createdAt}
                className="group flex items-center gap-1 rounded-lg px-1 hover:bg-gray-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    onLoadPreset(p);
                    setMenuOpen(false);
                  }}
                  className="min-w-0 flex-1 truncate px-1 py-1.5 text-left text-xs text-gray-800"
                  title={p.name}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(p.createdAt)}
                  aria-label={`Delete ${p.name}`}
                  className="rounded px-1 py-0.5 text-xs text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))
          )}

          {recentSearches.length > 0 && (
            <>
              <div className="mt-1 border-t border-gray-100 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Recent searches
              </div>
              {recentSearches.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    onLoadSearch(q);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                  title={q}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <span className="truncate">{q}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
