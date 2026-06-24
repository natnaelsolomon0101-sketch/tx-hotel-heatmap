"use client";

import { useRef, useState } from "react";
import { BUCKET_COLORS, BUCKET_LABELS, HotelProperties } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { HotelPercentiles } from "@/lib/percentile";
import PercentileBar from "./PercentileBar";
import { BookmarkIcon, CloseIcon } from "./icons";

type PropertyCardProps = {
  hotel: HotelProperties;
  onClose: () => void;
  /** Statewide + in-city RevPAR percentiles, computed from the full dataset. */
  percentiles?: HotelPercentiles | null;
  /** Google Street View deep link for this hotel's coordinates. */
  streetViewUrl?: string;
  /** Whether this hotel is on the watchlist; enables the Save toggle when set. */
  saved?: boolean;
  /** Toggle this hotel's watchlist membership. */
  onToggleSaved?: () => void;
  /** Whether this hotel is currently in the compare tray. */
  inCompare?: boolean;
  /** Whether the compare tray is full (and this hotel is not already in it). */
  compareFull?: boolean;
  /** Toggle this hotel's compare-tray membership; enables the Compare button. */
  onToggleCompare?: () => void;
  /**
   * Render as a full-width bottom sheet with a drag handle + swipe-to-dismiss
   * (touchscreen layout). When false/unset, renders the desktop floating
   * overlay. Driven by MapView from a `(max-width: 767px)` media query.
   */
  isMobile?: boolean;
};

function pct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums text-gray-900">
        {value}
      </div>
    </div>
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

function DirectionsIcon() {
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
      <path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export default function PropertyCard({
  hotel,
  onClose,
  percentiles,
  streetViewUrl,
  saved,
  onToggleSaved,
  inCompare,
  compareFull,
  onToggleCompare,
  isMobile = false,
}: PropertyCardProps) {
  // Which copy action last fired, so we can show targeted "Copied" feedback and
  // a transient toast. `null` when nothing has been copied recently.
  const [copied, setCopied] = useState<
    null | "address" | "coords" | "directions"
  >(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Swipe-to-dismiss (mobile only): track the vertical drag distance from the
  // touch start so a downward fling past the threshold closes the sheet, and
  // shorter drags spring back. `null` while no touch is in progress.
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const SWIPE_DISMISS_PX = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setDragY(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only follow downward drags; ignore upward pulls so internal scroll wins.
    setDragY(Math.max(0, delta));
  };

  const onTouchEnd = () => {
    if (touchStartY.current == null) return;
    if (dragY > SWIPE_DISMISS_PX) {
      onClose();
    }
    touchStartY.current = null;
    setDragY(0);
  };

  const titleCase = (s: string) =>
    s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

  const fullAddress = [
    titleCase(hotel.address),
    hotel.city ? titleCase(hotel.city) : "",
    [hotel.state, hotel.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${hotel.name}, ${fullAddress}`
  )}`;

  // The parent builds streetViewUrl from this hotel's geometry coordinates as
  // `...viewpoint=<lat>,<lng>`. Parse that "lat,lng" pair back out so we can
  // offer a "Copy coordinates" action without threading raw geometry through a
  // new prop. `null` when no street-view URL was provided.
  const coordsText = (() => {
    if (!streetViewUrl) return null;
    const m = streetViewUrl.match(/viewpoint=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    return m ? `${m[1]},${m[2]}` : null;
  })();

  const copy = (kind: "address" | "coords" | "directions", text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(kind);
        if (copyResetRef.current) clearTimeout(copyResetRef.current);
        copyResetRef.current = setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => setCopied(null));
  };

  const copyAddress = () => copy("address", fullAddress);
  const copyCoords = () => {
    if (coordsText) copy("coords", coordsText);
  };
  const copyDirections = () => copy("directions", directionsUrl);

  const toastLabel =
    copied === "address"
      ? "Address copied"
      : copied === "coords"
      ? "Coordinates copied"
      : copied === "directions"
      ? "Directions link copied"
      : null;

  return (
    <div
      role="dialog"
      aria-modal={isMobile || undefined}
      aria-label={titleCase(hotel.name)}
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-30 flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-card ring-1 ring-black/5"
          : "absolute z-30 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5 inset-x-2 bottom-2 max-h-[80vh] overflow-y-auto md:inset-x-auto md:left-4 md:right-auto md:bottom-6 md:w-80 md:max-h-none"
      }
      style={
        isMobile
          ? {
              transform: `translateY(${dragY}px)`,
              transition: dragY === 0 ? "transform 0.2s ease-out" : "none",
            }
          : undefined
      }
    >
      {/* Mobile bottom-sheet drag handle: visible grabber + a touch target for
          swipe-to-dismiss, with an explicit close button for tap dismissal. */}
      {isMobile && (
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative shrink-0 cursor-grab touch-none select-none bg-white pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-gray-300" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-0.5 flex h-12 w-12 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      <div
        className={
          isMobile ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "contents"
        }
      >
      <div className="relative h-36 w-full bg-gray-100">
        {hotel.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hotel.photo}
            alt={titleCase(hotel.name)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-xs text-gray-400">
            No photo available
          </div>
        )}
        <span
          className="absolute left-3 top-3 h-3.5 w-3.5 rounded-full ring-2 ring-white"
          style={{ backgroundColor: BUCKET_COLORS[hotel.bucket] }}
        />
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {onToggleSaved && (
            <button
              type="button"
              onClick={onToggleSaved}
              aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
              aria-pressed={saved}
              title={saved ? "Saved — click to remove" : "Save to watchlist"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
            >
              <BookmarkIcon className="h-4 w-4" filled={saved} />
            </button>
          )}
          {/* On mobile the drag-handle bar carries the close button, so the
              in-image close is desktop-only to avoid a redundant control. */}
          {!isMobile && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-base font-semibold leading-tight text-gray-900">
          {titleCase(hotel.name)}
        </h3>
        <p className="mt-0.5 text-sm text-gray-500">
          {titleCase(hotel.address)}
          {hotel.city ? `, ${titleCase(hotel.city)}` : ""} {hotel.state}{" "}
          {hotel.zip}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-gray-700 ring-1 ring-black/5"
            style={{ backgroundColor: `${BUCKET_COLORS[hotel.bucket]}1f` }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: BUCKET_COLORS[hotel.bucket] }}
            />
            {BUCKET_LABELS[hotel.bucket]}
          </span>
        </div>

        <p className="mt-1.5 text-xs font-medium text-gray-600">
          {hotel.rooms != null ? `${hotel.rooms} Rooms` : "Rooms n/a"} ·
          Hospitality
        </p>

        <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
          <Stat label="RevPAR" value={fmtMoney(hotel.revpar)} />
          <Stat label="ADR" value={fmtMoney(hotel.adr)} />
          <Stat label="Occupancy" value={pct(hotel.occupancy)} />
        </div>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <Stat label="Revenue" value={fmtMoney(hotel.revenue)} />
        </div>

        {percentiles && (
          <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Performance
            </div>
            <PercentileBar
              label="Statewide"
              value={percentiles.statewide}
            />
            <PercentileBar
              label={hotel.city ? `In ${titleCase(hotel.city)}` : "In market"}
              value={percentiles.cityCount <= 1 ? null : percentiles.inCity}
              note={
                percentiles.cityCount <= 1 && hotel.revpar != null
                  ? "only property in city"
                  : undefined
              }
            />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={copyAddress}
            aria-label="Copy address"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-black/5 transition-colors hover:bg-gray-200"
          >
            {copied === "address" ? <CheckIcon /> : <CopyIcon />}
            {copied === "address" ? "Copied" : "Copy address"}
          </button>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-700"
          >
            <DirectionsIcon />
            Directions
          </a>
        </div>

        <div className="mt-2 flex gap-2">
          {coordsText && (
            <button
              type="button"
              onClick={copyCoords}
              aria-label="Copy coordinates"
              title={coordsText}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-black/5 transition-colors hover:bg-gray-200"
            >
              {copied === "coords" ? <CheckIcon /> : <CopyIcon />}
              {copied === "coords" ? "Copied" : "Copy coordinates"}
            </button>
          )}
          <button
            type="button"
            onClick={copyDirections}
            aria-label="Copy directions link"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-black/5 transition-colors hover:bg-gray-200"
          >
            {copied === "directions" ? <CheckIcon /> : <CopyIcon />}
            {copied === "directions" ? "Copied" : "Directions link"}
          </button>
        </div>

        {streetViewUrl && (
          <a
            href={streetViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-black/5 transition-colors hover:bg-gray-200"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="2.4" />
              <path d="M12 7.5c-2 0-3 1.2-3 3v3h1.5l.5 6h2l.5-6H15v-3c0-1.8-1-3-3-3z" />
            </svg>
            Street View
          </a>
        )}

        {onToggleCompare && (
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={!inCompare && compareFull}
            title={
              inCompare
                ? "Remove from compare"
                : compareFull
                ? "Max 3 in compare"
                : "Add to compare"
            }
            className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-black/5 transition-colors ${
              inCompare
                ? "bg-gray-900 text-white hover:bg-gray-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-gray-100"
            }`}
          >
            {inCompare ? "★ In compare" : compareFull ? "Compare full (3)" : "+ Compare"}
          </button>
        )}

        {hotel.flagged && (
          <p className="mt-2 text-[11px] text-amber-600">
            Some financials were missing for this property.
          </p>
        )}
      </div>
      </div>

      {/* Transient copy confirmation toast (auto-dismisses after ~2s). */}
      {toastLabel && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gray-900/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-card"
        >
          <CheckIcon />
          {toastLabel}
        </div>
      )}
    </div>
  );
}
