"use client";

import { BUCKET_COLORS, HotelProperties } from "@/lib/types";
import { CloseIcon } from "./icons";

type PropertyCardProps = {
  hotel: HotelProperties;
  onClose: () => void;
};

function money(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

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

export default function PropertyCard({ hotel, onClose }: PropertyCardProps) {
  const titleCase = (s: string) =>
    s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

  return (
    <div className="absolute bottom-6 left-4 z-30 w-80 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5">
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
        <p className="mt-1 text-xs font-medium text-gray-600">
          {hotel.rooms != null ? `${hotel.rooms} Rooms` : "Rooms n/a"} ·
          Hospitality
        </p>

        <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
          <Stat label="RevPAR" value={money(hotel.revpar)} />
          <Stat label="ADR" value={money(hotel.adr)} />
          <Stat label="Occupancy" value={pct(hotel.occupancy)} />
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
