"use client";

import { useEffect, useRef } from "react";

type ShortcutsHelpProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["/"], label: "Focus search" },
  { keys: ["L"], label: "Toggle pins / heatmap" },
  { keys: ["R"], label: "Recenter on Texas" },
  { keys: ["Alt", "R"], label: "Clear all filters" },
  { keys: ["?"], label: "Toggle this help" },
  { keys: ["Esc"], label: "Close panels / clear selection" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export default function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and trap focus within the panel while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Move focus into the dialog on open; restore it on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => prev?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[hsl(var(--ink)/0.4)] backdrop-blur-sm"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm rounded-2xl bg-surface/95 p-4 shadow-md ring-1 ring-border backdrop-blur"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="label-overline">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-subtle transition-base hover:text-foreground"
          >
            <svg
              aria-hidden="true"
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
              <span className="text-sm text-foreground">{label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 border-t border-border pt-2 text-[11px] leading-snug text-subtle">
          Shortcuts are ignored while typing in the search box. Press{" "}
          <Kbd>?</Kbd> anytime to reopen this.
        </p>
      </div>
    </div>
  );
}
