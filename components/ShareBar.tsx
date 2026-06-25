"use client";

import { Bucket, BUCKET_COLORS } from "@/lib/types";

/** Stacked red/yellow/gray RevPAR composition bar shared by Markets and Rollups. */
export default function ShareBar({ shares }: { shares: Record<Bucket, number> }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {(["red", "yellow", "gray"] as const).map((b) =>
        shares[b] > 0 ? (
          <span
            key={b}
            className="h-full"
            style={{
              width: `${shares[b] * 100}%`,
              backgroundColor: BUCKET_COLORS[b],
            }}
          />
        ) : null
      )}
    </span>
  );
}
