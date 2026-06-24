"use client";

import { useEffect } from "react";

type ShortcutHandlers = {
  onSearch: () => void;
  onToggleLayers: () => void;
  onRecenter: () => void;
  onEscape: () => void;
  onToggleHelp: () => void;
};

// Returns true when the event originated from a field where typing should
// take precedence over single-key shortcuts.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { onSearch, onToggleLayers, onRecenter, onEscape, onToggleHelp } =
    handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape always fires (even from inputs) so it can blur/dismiss.
      if (e.key === "Escape") {
        onEscape();
        return;
      }

      // All other shortcuts are suppressed while typing or with modifiers held.
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          onSearch();
          break;
        case "l":
        case "L":
          e.preventDefault();
          onToggleLayers();
          break;
        case "r":
        case "R":
          e.preventDefault();
          onRecenter();
          break;
        case "?":
          e.preventDefault();
          onToggleHelp();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSearch, onToggleLayers, onRecenter, onEscape, onToggleHelp]);
}

export default useKeyboardShortcuts;
