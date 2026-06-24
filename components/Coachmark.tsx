"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "txh_seen_intro";

const TIPS: { color: string; title: string; body: string }[] = [
  {
    color: "#ee2233",
    title: "Filter by RevPAR color",
    body: "Tap a row in the RevPAR scale to show only high, mid, or low performers.",
  },
  {
    color: "#f5b301",
    title: "Search, sort & export",
    body: "Use the property list to find a hotel, re-sort, or export the current view to CSV.",
  },
  {
    color: "#9aa0a6",
    title: "Toggle the heatmap",
    body: "The layers tool on the left swaps GPU pins for a RevPAR-weighted heatmap.",
  },
  {
    color: "#1a73e8",
    title: "Click a hotel",
    body: "Click any pin to fly in and open its RevPAR, ADR, occupancy and revenue details.",
  },
];

// First-run coachmark. Self-managing: reads/writes the localStorage flag itself
// and renders nothing once dismissed. SSR-safe — stays hidden until mounted.
export default function Coachmark() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // localStorage unavailable (private mode / blocked) — skip the hint.
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Non-fatal: just don't persist.
    }
  };

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-2 md:bottom-6">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white/95 p-4 shadow-card ring-1 ring-black/5 backdrop-blur md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Welcome
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-gray-900">
              Texas RevPAR intelligence
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <ul className="mt-3 flex flex-col gap-2.5">
          {TIPS.map(({ color, title, body }) => (
            <li key={title} className="flex items-start gap-2.5">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight text-gray-800">
                  {title}
                </span>
                <span className="block text-[13px] leading-snug text-gray-500">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
