"use client";

import { useEffect, useRef, useState } from "react";

import { describeView, encodeState, UrlState } from "@/lib/urlState";
import { Range } from "./RangeFilters";

type ShareButtonProps = {
  /** Current serializable view state (same object MapView feeds useUrlState). */
  urlState: UrlState;
  /** Data-driven full bounds for the range sliders. */
  ranges: { revpar: Range; rooms: Range };
  /** Live RevPAR slider value [min, max]. */
  revparVal: Range;
  /** Live rooms slider value [min, max]. */
  roomsVal: Range;
  /** Number of properties currently in scope (for the summary line). */
  count: number;
};

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

type CopiedWhat = "link" | "summary" | null;

/**
 * Header affordance that makes the (silently-synced) URL state explicit:
 * one click copies a shareable link to the current filtered view, and a popover
 * offers "Copy link", "Copy as filter summary", and the raw URL for manual
 * selection. The link is built synchronously from encodeState(urlState) so it
 * reflects the latest state even before useUrlState's 300ms debounce lands.
 *
 * SSR-safe: window is only read in event handlers / effects, never at render.
 */
export default function ShareButton({
  urlState,
  ranges,
  revparVal,
  roomsVal,
  count,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopiedWhat>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronous, always-current shareable URL.
  const buildUrl = () => {
    if (typeof window === "undefined") return "";
    const qs = encodeState(urlState);
    return (
      window.location.origin +
      window.location.pathname +
      (qs ? `?${qs}` : "")
    );
  };

  const summary = describeView(
    urlState,
    { revpar: ranges.revpar, rooms: ranges.rooms },
    { revpar: revparVal, rooms: roomsVal },
    count
  );

  const flash = (what: CopiedWhat) => {
    setCopied(what);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(null), 1600);
  };

  const copyText = async (text: string, what: CopiedWhat) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      // Clipboard API unavailable (insecure context / denied): fall back to
      // selecting the readonly input so the user can copy manually.
      const input = urlInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
      setCopied(null);
    }
  };

  const copyLink = () => copyText(buildUrl(), "link");
  const copySummary = () => copyText(summary, "summary");

  // The primary button: copy the link straight away and open the popover so the
  // user sees what happened and can reach the other options.
  const onPrimary = () => {
    copyLink();
    setOpen(true);
  };

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // Keep the readonly input current whenever the popover is open.
  const shareUrl = open ? buildUrl() : "";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={onPrimary}
        title="Copy a shareable link to this view"
        aria-label="Share this view"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-base hover:bg-muted md:px-3"
      >
        {copied === "link" ? <CheckIcon /> : <ShareIcon />}
        <span className="hidden sm:inline">
          {copied === "link" ? "Copied!" : "Share"}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Share this view"
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl bg-surface p-3 shadow-md ring-1 ring-border"
        >
          <div className="label-overline">
            Share this view
          </div>

          <p className="mt-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground ring-1 ring-border">
            {summary}
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-white transition-base hover:bg-ink-hover"
            >
              {copied === "link" ? <CheckIcon /> : <CopyIcon />}
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={copySummary}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border transition-base hover:text-foreground hover:ring-border-strong"
            >
              {copied === "summary" ? <CheckIcon /> : <CopyIcon />}
              {copied === "summary" ? "Copied" : "Copy summary"}
            </button>
          </div>

          <label className="mt-2.5 block">
            <span className="sr-only">Shareable link</span>
            <input
              ref={urlInputRef}
              type="text"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full select-all rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
