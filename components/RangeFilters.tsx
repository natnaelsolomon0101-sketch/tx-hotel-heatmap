"use client";

import { fmtMoney } from "@/lib/stats";

export type Range = [number, number];

type RangeFiltersProps = {
  /** Data-driven bounds for RevPAR (dollars). */
  revparMin: number;
  revparMax: number;
  /** Current RevPAR selection [min, max]. */
  revpar: Range;
  onRevparChange: (r: Range) => void;
  /** Data-driven bounds for room count. */
  roomsMin: number;
  roomsMax: number;
  /** Current rooms selection [min, max]. */
  rooms: Range;
  onRoomsChange: (r: Range) => void;
  onReset: () => void;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

const fmtRooms = (n: number) => `${Math.round(n).toLocaleString()} rms`;

/**
 * Dual-handle numeric range control. Two overlaid native <input type=range>
 * sliders share one track; the higher one floats above on the left half and
 * the lower one on the right half so both thumbs stay grabbable. Zero deps.
 */
function DualRange({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: Range;
  onChange: (r: Range) => void;
  format: (n: number) => string;
}) {
  const span = max - min || 1;
  const [lo, hi] = value;
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;
  const disabled = max <= min;

  const setLo = (n: number) => onChange([clamp(n, min, hi), hi]);
  const setHi = (n: number) => onChange([lo, clamp(n, lo, max)]);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="font-mono tabular-nums text-foreground text-meta">
          {format(lo)} <span className="text-subtle">–</span> {format(hi)}
        </span>
      </div>
      <div className="relative h-4">
        {/* base track */}
        <span className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        {/* selected span */}
        <span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent transition-base"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          disabled={disabled}
          onChange={(e) => setLo(Number(e.target.value))}
          aria-label={`${label} minimum`}
          className="range-thumb absolute left-0 top-0 h-4 w-full appearance-none bg-transparent"
          style={{ zIndex: lo > max - (max - min) / 2 ? 5 : 4 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          disabled={disabled}
          onChange={(e) => setHi(Number(e.target.value))}
          aria-label={`${label} maximum`}
          className="range-thumb absolute left-0 top-0 h-4 w-full appearance-none bg-transparent"
          style={{ zIndex: 5 }}
        />
      </div>
      <style jsx>{`
        .range-thumb {
          pointer-events: none;
        }
        .range-thumb::-webkit-slider-thumb {
          pointer-events: auto;
          -webkit-appearance: none;
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 9999px;
          background: #ffffff;
          border: 1px solid hsl(var(--accent));
          box-shadow: var(--shadow-pop);
          cursor: pointer;
          transition: box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .range-thumb::-moz-range-thumb {
          pointer-events: auto;
          height: 14px;
          width: 14px;
          border-radius: 9999px;
          background: #ffffff;
          border: 1px solid hsl(var(--accent));
          box-shadow: var(--shadow-pop);
          cursor: pointer;
          transition: box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .range-thumb:focus-visible {
          outline: none;
        }
        .range-thumb:focus-visible::-webkit-slider-thumb {
          box-shadow: var(--shadow-pop), 0 0 0 2px hsl(var(--ring));
        }
        .range-thumb:focus-visible::-moz-range-thumb {
          box-shadow: var(--shadow-pop), 0 0 0 2px hsl(var(--ring));
        }
        .range-thumb:disabled::-webkit-slider-thumb {
          border-color: hsl(var(--border-strong));
          cursor: default;
        }
        .range-thumb:disabled::-moz-range-thumb {
          border-color: hsl(var(--border-strong));
          cursor: default;
        }
        .range-thumb::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}

export default function RangeFilters({
  revparMin,
  revparMax,
  revpar,
  onRevparChange,
  roomsMin,
  roomsMax,
  rooms,
  onRoomsChange,
  onReset,
}: RangeFiltersProps) {
  const atDefaults =
    revpar[0] <= revparMin &&
    revpar[1] >= revparMax &&
    rooms[0] <= roomsMin &&
    rooms[1] >= roomsMax;

  // RevPAR here is a small daily scale; sub-dollar steps would be noisy, so
  // step by whole dollars (bounds are data-driven, never hardcoded).
  const revparStep = Math.max(1, Math.round((revparMax - revparMin) / 200));
  const roomsStep = Math.max(1, Math.round((roomsMax - roomsMin) / 200));

  return (
    <div className="hidden shrink-0 rounded-panel bg-surface p-3 shadow-sm ring-1 ring-border md:block">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label-overline">Range filters</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={atDefaults}
          className={`text-xs font-medium transition-base ${
            atDefaults
              ? "text-subtle"
              : "text-accent hover:text-[hsl(var(--accent-hover))]"
          }`}
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <DualRange
          label="RevPAR"
          min={revparMin}
          max={revparMax}
          step={revparStep}
          value={revpar}
          onChange={onRevparChange}
          format={fmtMoney}
        />
        <DualRange
          label="Rooms"
          min={roomsMin}
          max={roomsMax}
          step={roomsStep}
          value={rooms}
          onChange={onRoomsChange}
          format={fmtRooms}
        />
      </div>

      <p className="mt-2 border-t border-border pt-2 text-meta leading-snug text-subtle">
        Hotels with no RevPAR or room count are hidden once a range is narrowed.
      </p>
    </div>
  );
}
