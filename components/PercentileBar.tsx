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

  // RevPAR-semantic tier band: top third -> high, middle -> mid, bottom -> low.
  const tierVar =
    pct == null
      ? "--revpar-low"
      : pct >= 66
      ? "--revpar-high"
      : pct >= 33
      ? "--revpar-mid"
      : "--revpar-low";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-meta font-mono uppercase tracking-wide text-subtle">
          {label}
        </span>
        <span className="text-meta font-mono tabular-nums text-muted-foreground">
          {pct == null ? (
            "—"
          ) : (
            <>
              <span className="font-semibold text-foreground">P{pct}</span>
              {descriptor ? (
                <span className="ml-1 text-subtle">{descriptor}</span>
              ) : null}
            </>
          )}
        </span>
      </div>
      {pct != null && (
        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: `hsl(var(${tierVar}))` }}
            role="meter"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} percentile`}
          />
          <span
            className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${pct}%`,
              backgroundColor: "hsl(var(--accent))",
            }}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}
