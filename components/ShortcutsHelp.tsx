"use client";

import { useEffect } from "react";

type ShortcutsHelpProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["/"], label: "Focus search" },
  { keys: ["L"], label: "Toggle pins / heatmap" },
  { keys: ["R"], label: "Recenter on Texas" },
  { keys: ["?"], label: "Toggle this help" },
  { keys: ["Esc"], label: "Close panels / clear selection" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-700 shadow-sm">
      {children}
    </kbd>
  );
}

export default function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  // Close on Escape regardless of focus while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close keyboard shortcuts"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-gray-900/40 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm rounded-2xl bg-white/95 p-4 shadow-card ring-1 ring-black/5 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 transition hover:text-gray-700"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {SHORTCUTS.map(({ keys, label }) => (
            <li
              key={label}
              className="flex items-center justify-between rounded-lg px-2 py-1.5"
            >
              <span className="text-sm text-gray-800">{label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
          Shortcuts are ignored while typing in the search box. Press{" "}
          <Kbd>?</Kbd> anytime to reopen this.
        </p>
      </div>
    </div>
  );
}
