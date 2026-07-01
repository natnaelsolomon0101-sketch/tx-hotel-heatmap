"use client";

import { memo } from "react";

import { CompsetPeer, CompsetResult, HotelFeature } from "@/lib/types";
import { fmtMoney } from "@/lib/stats";
import { titleCase } from "@/lib/format";
import PercentileBar from "./PercentileBar";
import { CloseIcon, PlusIcon } from "./icons";

export interface CompsetPanelProps {
  /** The hotel whose competitive set is shown; drives the header + "this hotel" column. */
  subject: HotelFeature;
  /** Computed competitive set (peers, averages, rank) from lib/compset. */
  result: CompsetResult;
  /** Dismiss the panel. */
  onClose: () => void;
  /** Drop a peer from — or re-add it to — the set (row toggle). Optional. */
  onTogglePeer?: (peerId: number) => void;
  /** Focus a peer on the map (click its name). Optional. */
  onSelectPeer?: (peerId: number) => void;
  /** Peer ids the user has dropped; rendered struck-through with an "add back" affordance. */
  removedPeerIds?: number[];
}

/** Occupancy fraction (0–1) → "72%"; null/NaN → em-dash. */
function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Distance in miles → "1.2 mi"; null/undefined → em-dash. */
function miles(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} mi`;
}

/** 1 → "1st", 2 → "2nd", 68 → "68th". */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Signed money delta of subject vs compset avg. null when either side is missing. */
function moneyDelta(
  subject: number | null | undefined,
  avg: number | null | undefined
): { text: string; positive: boolean } | null {
  if (subject == null || avg == null) return null;
  const d = subject - avg;
  const rounded = Math.round(d);
  if (rounded === 0) return { text: "±$0", positive: true };
  return { text: `${rounded > 0 ? "+" : "−"}${fmtMoney(Math.abs(rounded))}`, positive: rounded > 0 };
}

/** Signed occupancy delta in percentage points. null when either side is missing. */
function occDelta(
  subject: number | null | undefined,
  avg: number | null | undefined
): { text: string; positive: boolean } | null {
  if (subject == null || avg == null) return null;
  const d = Math.round((subject - avg) * 100);
  if (d === 0) return { text: "±0 pts", positive: true };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} pts`, positive: d > 0 };
}

/** One metric row of the subject-vs-compset comparison. */
function CompareRow({
  label,
  subjectValue,
  avgValue,
  delta,
}: {
  label: string;
  subjectValue: string;
  avgValue: string;
  delta: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <span className="label-overline">{label}</span>
      <span className="text-data-sm text-foreground tabular-nums text-right">
        {subjectValue}
      </span>
      <span className="text-data-sm text-muted-foreground tabular-nums text-right">
        {avgValue}
      </span>
      <span className="col-start-2 col-span-2 text-right">
        {delta ? (
          <span
            className={`text-meta font-mono font-semibold ${
              delta.positive ? "text-positive" : "text-negative"
            }`}
          >
            {delta.text} vs avg
          </span>
        ) : (
          <span className="text-meta text-subtle">—</span>
        )}
      </span>
    </div>
  );
}

/** One peer row in the mini comparison table. */
function PeerRow({
  peer,
  removed,
  onToggle,
  onSelect,
}: {
  peer: CompsetPeer;
  removed: boolean;
  onToggle?: (peerId: number) => void;
  onSelect?: (peerId: number) => void;
}) {
  const name = titleCase(peer.name);
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2.5 border-t border-border py-1.5 ${
        removed ? "opacity-50" : ""
      }`}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(peer.id)}
          title={`Focus ${name} on the map`}
          className={`transition-base min-w-0 truncate rounded text-left text-xs font-medium text-foreground hover:text-accent focus-visible:text-accent ${
            removed ? "line-through" : ""
          }`}
        >
          {name}
        </button>
      ) : (
        <span
          className={`min-w-0 truncate text-xs font-medium text-foreground ${
            removed ? "line-through" : ""
          }`}
        >
          {name}
        </span>
      )}

      <span className="text-data-sm text-foreground tabular-nums text-right">
        {fmtMoney(peer.revpar)}
      </span>
      <span className="text-meta font-mono text-muted-foreground tabular-nums text-right">
        {fmtMoney(peer.adr)}
      </span>

      <span className="flex items-center justify-end gap-1.5">
        <span className="text-meta text-subtle tabular-nums">
          {miles(peer.distanceMi)}
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={() => onToggle(peer.id)}
            aria-label={removed ? `Add ${name} back to compset` : `Remove ${name} from compset`}
            aria-pressed={removed}
            title={removed ? "Add back to compset" : "Remove from compset"}
            className="transition-base flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-foreground"
          >
            {removed ? (
              <PlusIcon className="h-3.5 w-3.5" />
            ) : (
              <CloseIcon className="h-3 w-3" />
            )}
          </button>
        )}
      </span>
    </div>
  );
}

function CompsetPanel({
  subject,
  result,
  onClose,
  onTogglePeer,
  onSelectPeer,
  removedPeerIds,
}: CompsetPanelProps) {
  const p = subject.properties;
  const subjectName = titleCase(p.name);
  const removed = new Set(removedPeerIds ?? []);

  // Basis line: submarket + scale, or radius + tier, matching the two compset modes.
  const scaleLabel = result.scale ?? result.hotelClass ?? null;
  const basisLine =
    result.basis === "submarket-scale"
      ? [
          result.submarket ? `Submarket: ${titleCase(result.submarket)}` : "Submarket",
          scaleLabel ? titleCase(scaleLabel) : null,
          `${result.count} ${result.count === 1 ? "peer" : "peers"}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          result.radiusMi != null ? `Within ${result.radiusMi} mi` : "Nearby",
          scaleLabel ? titleCase(scaleLabel) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const total = result.count + 1; // subject + peers
  // result.percentile is a 0–1 fraction; PercentileBar + the ordinal label both
  // want a 0–100 percentile.
  const percentile100 =
    result.percentile == null ? null : result.percentile * 100;
  const rankText =
    result.rank != null
      ? `Rank ${result.rank} of ${total}${
          percentile100 != null ? ` (${ordinal(Math.round(percentile100))} pctile)` : ""
        }`
      : "Rank unavailable";

  const subjectRevpar = result.subjectRevpar ?? p.revpar;
  const revparDelta = moneyDelta(subjectRevpar, result.avgRevpar);
  const adrDelta = moneyDelta(p.adr, result.avgAdr);
  const occD = occDelta(p.occupancy, result.avgOccupancy);

  return (
    <section
      role="region"
      aria-label={`Competitive set for ${subjectName}`}
      className="flex h-full w-full flex-col overflow-hidden rounded-panel bg-surface shadow-lg ring-1 ring-border"
    >
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <div className="label-overline text-accent">Compset</div>
          <h2 className="text-display mt-0.5 truncate text-foreground leading-tight">
            {subjectName}
          </h2>
          <p className="text-meta mt-0.5 text-muted-foreground">{basisLine}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close compset"
          className="transition-base flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CloseIcon />
        </button>
      </div>

      {result.count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
          <p className="text-meta font-medium text-foreground">
            No comparable hotels found
          </p>
          <p className="text-meta text-muted-foreground">
            {result.basis === "submarket-scale"
              ? "No comparable hotels found in this submarket."
              : "No comparable hotels found within this radius."}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {/* Subject vs compset average */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3">
            <span className="text-meta font-medium text-subtle">Metric</span>
            <span className="label-overline text-right">This hotel</span>
            <span className="label-overline text-right">Compset avg</span>
          </div>
          <div className="mt-1 divide-y divide-border border-t border-border">
            <CompareRow
              label="RevPAR"
              subjectValue={fmtMoney(subjectRevpar)}
              avgValue={fmtMoney(result.avgRevpar)}
              delta={revparDelta}
            />
            <CompareRow
              label="ADR"
              subjectValue={fmtMoney(p.adr)}
              avgValue={fmtMoney(result.avgAdr)}
              delta={adrDelta}
            />
            <CompareRow
              label="Occupancy"
              subjectValue={pct(p.occupancy)}
              avgValue={pct(result.avgOccupancy)}
              delta={occD}
            />
          </div>

          {/* Rank + percentile */}
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label-overline">Standing</span>
              <span className="text-meta font-mono font-semibold tabular-nums text-foreground">
                {rankText}
              </span>
            </div>
            <PercentileBar label="Compset" value={percentile100} />
          </div>

          {/* Peer table */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-2.5">
              <span className="label-overline">Peer ({result.count})</span>
              <span className="label-overline text-right">RevPAR</span>
              <span className="label-overline text-right">ADR</span>
              <span className="label-overline text-right">Dist</span>
            </div>
            <div className="mt-1">
              {result.peers.map((peer) => (
                <PeerRow
                  key={peer.id}
                  peer={peer}
                  removed={removed.has(peer.id)}
                  onToggle={onTogglePeer}
                  onSelect={onSelectPeer}
                />
              ))}
            </div>
          </div>

          {p.flagged && (
            <p className="text-meta mt-3 text-warning">
              Some financials were missing for the subject property.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(CompsetPanel);
