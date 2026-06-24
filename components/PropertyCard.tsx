"use client";

import { useState } from "react";
import { BUCKET_COLORS, BUCKET_LABELS, HotelProperties } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { CloseIcon } from "./icons";

type PropertyCardProps = {
  hotel: HotelProperties;
  onClose: () => void;
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

export default function PropertyCard({ hotel, onClose }: PropertyCardProps) {
  const [copied, setCopied] = useState(false);

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

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="absolute z-30 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5
        inset-x-2 bottom-2 max-h-[80vh] overflow-y-auto
        md:inset-x-auto md:left-4 md:right-auto md:bottom-6 md:w-80 md:max-h-none"
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
        >
          <CloseIcon />
        </button>
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

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={copyAddress}
            aria-label="Copy address"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-black/5 transition-colors hover:bg-gray-200"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy address"}
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

        {hotel.flagged && (
          <p className="mt-2 text-[11px] text-amber-600">
            Some financials were missing for this property.
          </p>
        )}
      </div>
    </div>
  );
}
