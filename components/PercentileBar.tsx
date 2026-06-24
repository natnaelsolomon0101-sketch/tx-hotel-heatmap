"use client";

import { percentileDescriptor, roundPct } from "@/lib/percentile";

/**
 * A thin horizontal percentile meter: a label, a filled bar whose width is the
 * percentile, and the percentile % with an optional descriptor.
 *
 * `value` is a 0–100 percentile. When null the bar is hidden and a dash shown.
 * `note` overrides the auto descriptor (e.g. "only property in city").
 */
export default function PercentileBar({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note?: string | null;
}) {
  const pct = value == null ? null : roundPct(value);
  const descriptor =
    note !== undefined
      ? note
      : pct == null
      ? null
      : percentileDescriptor(pct);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-gray-600">
          {pct == null ? (
            "—"
          ) : (
            <>
              <span className="font-semibold text-gray-900">P{pct}</span>
              {descriptor ? (
                <span className="ml-1 text-gray-400">{descriptor}</span>
              ) : null}
            </>
          )}
        </span>
      </div>
      {pct != null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-900 transition-[width]"
            style={{ width: `${pct}%` }}
            role="meter"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} percentile`}
          />
        </div>
      )}
    </div>
  );
}
