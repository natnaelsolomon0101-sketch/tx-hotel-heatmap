"use client";

import { useEffect, useRef, useState } from "react";
import { Bucket, BUCKET_LABELS, HotelHistory, HotelProperties } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { HotelPercentiles } from "@/lib/percentile";
import PercentileBar from "./PercentileBar";
import RevparTrend from "./RevparTrend";
import { BookmarkIcon, CloseIcon } from "./icons";

type PropertyCardProps = {
  hotel: HotelProperties;
  /** Trend + T12, fetched lazily by MapView (undefined until it loads). */
  history?: HotelHistory;
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

// Maps the dataset's RevPAR bucket to the shared revpar tier tokens so the
// pill background (-soft) and text (solid) stay in sync across the app.
const BUCKET_TIER: Record<Bucket, { soft: string; solid: string }> = {
  red: { soft: "bg-revpar-high-soft", solid: "text-revpar-high" },
  yellow: { soft: "bg-revpar-mid-soft", solid: "text-revpar-mid" },
  gray: { soft: "bg-revpar-low-soft", solid: "text-revpar-low" },
};

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string | null;
}) {
  return (
    <div className="flex-1">
      <div className="label-overline">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-data text-foreground">{value}</span>
        {delta && (
          <span
            className={`text-meta font-mono font-semibold ${
              delta.startsWith("-") ? "text-negative" : "text-positive"
            }`}
          >
            {delta}
          </span>
        )}
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
  history: hist,
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

  // When the dataset has no photo, fetch one from Google (Places photo, then
  // Street View) via our server route. Falls back to the placeholder on 404.
  const apiPhoto = hotel.photo
    ? null
    : `/api/hotel-photo?name=${encodeURIComponent(hotel.name)}${
        coordsText ? `&loc=${coordsText}` : ""
      }`;
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [hotel.name, coordsText]);
  const photoSrc = hotel.photo ?? (photoFailed ? null : apiPhoto);

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
          ? "fixed inset-x-0 bottom-0 z-30 flex max-h-[90vh] flex-col overflow-hidden rounded-t-panel bg-surface shadow-lg ring-1 ring-border"
          : "absolute z-30 overflow-hidden rounded-panel bg-surface shadow-lg ring-1 ring-border inset-x-2 bottom-2 max-h-[80vh] overflow-y-auto md:inset-x-auto md:left-4 md:right-auto md:bottom-6 md:w-80 md:max-h-none"
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
          className="relative shrink-0 cursor-grab touch-none select-none bg-surface pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-border-strong" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="transition-base absolute right-2 top-0.5 flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
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
      <div className="relative h-36 w-full bg-muted">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={titleCase(hotel.name)}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-subtle">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-9 w-9"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.5" />
              <path d="M21 16l-5-5L5 20" />
            </svg>
          </div>
        )}
        {/* Subtle bottom scrim so overlay controls and any photo edge read cleanly. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
        <span
          className={`absolute left-3 top-3 h-3.5 w-3.5 rounded-full ring-2 ring-white ${
            hotel.bucket === "red"
              ? "bg-revpar-high"
              : hotel.bucket === "yellow"
              ? "bg-revpar-mid"
              : "bg-revpar-low"
          }`}
        />
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {onToggleSaved && (
            <button
              type="button"
              onClick={onToggleSaved}
              aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
              aria-pressed={saved}
              title={saved ? "Saved — click to remove" : "Save to watchlist"}
              className="transition-base flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
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
              className="transition-base flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-display text-foreground leading-tight">
          {titleCase(hotel.name)}
        </h3>
        <p className="text-meta mt-0.5 text-muted-foreground">
          {titleCase(hotel.address)}
          {hotel.city ? `, ${titleCase(hotel.city)}` : ""} {hotel.state}{" "}
          {hotel.zip}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <span
            className={`text-meta inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono font-semibold ${BUCKET_TIER[hotel.bucket].soft} ${BUCKET_TIER[hotel.bucket].solid}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                hotel.bucket === "red"
                  ? "bg-revpar-high"
                  : hotel.bucket === "yellow"
                  ? "bg-revpar-mid"
                  : "bg-revpar-low"
              }`}
            />
            {BUCKET_LABELS[hotel.bucket]}
          </span>
        </div>

        <p className="text-meta mt-1.5 font-medium text-muted-foreground">
          {hotel.rooms != null ? `${hotel.rooms} Rooms` : "Rooms n/a"} ·
          Hospitality
        </p>

        <div className="mt-3 flex gap-3 border-t border-border pt-3">
          <Stat label="RevPAR" value={fmtMoney(hotel.revpar)} />
          <Stat label="ADR" value={fmtMoney(hotel.adr)} />
          <Stat label="Occupancy" value={pct(hotel.occupancy)} />
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <Stat label="Revenue (latest mo)" value={fmtMoney(hotel.revenue)} />
        </div>

        <RevparTrend
          history={hist?.history}
          t12Revenue={hist?.t12Revenue}
          t12Revpar={hist?.t12Revpar}
        />

        {percentiles && (
          <div className="mt-3 space-y-2.5 border-t border-border pt-3">
            <div className="label-overline">Performance</div>
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
            className="transition-base inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground ring-1 ring-border hover:-translate-y-px hover:bg-[hsl(var(--surface-muted))]"
          >
            {copied === "address" ? <CheckIcon /> : <CopyIcon />}
            {copied === "address" ? "Copied" : "Copy address"}
          </button>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-base inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white hover:-translate-y-px hover:bg-ink-hover"
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
              className="transition-base inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground ring-1 ring-border hover:-translate-y-px hover:bg-[hsl(var(--surface-muted))]"
            >
              {copied === "coords" ? <CheckIcon /> : <CopyIcon />}
              {copied === "coords" ? "Copied" : "Copy coordinates"}
            </button>
          )}
          <button
            type="button"
            onClick={copyDirections}
            aria-label="Copy directions link"
            className="transition-base inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground ring-1 ring-border hover:-translate-y-px hover:bg-[hsl(var(--surface-muted))]"
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
            className="transition-base mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground ring-1 ring-border hover:-translate-y-px hover:bg-[hsl(var(--surface-muted))]"
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
            className={`transition-base mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
              inCompare
                ? "bg-[hsl(var(--accent)/0.10)] text-accent ring-1 ring-[hsl(var(--accent)/0.30)] hover:-translate-y-px"
                : "bg-muted text-foreground ring-1 ring-border hover:-translate-y-px hover:bg-[hsl(var(--surface-muted))] disabled:translate-y-0 disabled:opacity-40 disabled:hover:bg-muted"
            }`}
          >
            {inCompare ? "★ In compare" : compareFull ? "Compare full (3)" : "+ Compare"}
          </button>
        )}

        {hotel.flagged && (
          <p className="text-meta mt-2 text-warning">
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
          className="text-meta pointer-events-none absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-medium text-white shadow-md"
        >
          <CheckIcon />
          {toastLabel}
        </div>
      )}
    </div>
  );
}
