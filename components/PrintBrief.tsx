"use client";

import { BUCKET_COLORS, BUCKET_LABELS, Bucket, HotelFeature } from "@/lib/types";
import { PortfolioStats, fmtMoney, fmtMarket } from "@/lib/stats";
import { titleCase } from "@/lib/format";

type PrintBriefProps = {
  stats: PortfolioStats;
  topRows: HotelFeature[];
  period: string;
};

const BUCKET_ORDER: Bucket[] = ["red", "yellow", "gray"];

const pct = (n: number, total: number) =>
  total ? `${Math.round((n / total) * 100)}%` : "0%";

/**
 * Print-only one-page Market Brief. Hidden on screen (`hidden print:block`);
 * the on-screen map UI carries `print:hidden`, and globals.css unlocks the body
 * scroll/overflow under @media print so this prints as a normal document page.
 */
export default function PrintBrief({ stats, topRows, period }: PrintBriefProps) {
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="hidden print:block print-brief text-gray-900">
      {/* Title */}
      <header className="mb-5 border-b-2 border-gray-900 pb-3">
        <h1 className="text-2xl font-bold leading-tight">
          TX Hotel RevPAR Market Brief
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Texas Comptroller data &middot; Data period: {period} &middot;
          Generated {generated}
        </p>
      </header>

      {/* Portfolio summary */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Portfolio summary
        </h2>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Hotels in scope" value={stats.total.toLocaleString()} />
          <Stat label="With RevPAR" value={stats.withRevpar.toLocaleString()} />
          <Stat label="Avg RevPAR" value={fmtMoney(stats.avgRevpar)} />
          <Stat label="Median RevPAR" value={fmtMoney(stats.medianRevpar)} />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Top market: <span className="font-medium">{fmtMarket(stats.topMarket)}</span>
          {stats.topMarket
            ? ` — ${fmtMoney(stats.topMarket.avg)} avg across ${stats.topMarket.count} hotels`
            : ""}
        </p>
      </section>

      {/* Bucket distribution */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          RevPAR distribution
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {BUCKET_ORDER.map((b) => (
            <div
              key={b}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: BUCKET_COLORS[b] }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums">
                  {stats.buckets[b].toLocaleString()} ({pct(stats.buckets[b], stats.total)})
                </span>
                <span className="block text-[10px] leading-tight text-gray-500">
                  {BUCKET_LABELS[b]}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Top properties table */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Top {topRows.length} properties in scope
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="w-7 py-1.5 pr-2 font-semibold">#</th>
              <th className="py-1.5 pr-2 font-semibold">Property</th>
              <th className="py-1.5 pr-2 font-semibold">City</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Rooms</th>
              <th className="py-1.5 pr-2 text-right font-semibold">RevPAR</th>
              <th className="py-1.5 font-semibold">Tier</th>
            </tr>
          </thead>
          <tbody>
            {topRows.map((f, i) => {
              const p = f.properties;
              return (
                <tr
                  key={`${p.name}-${i}`}
                  className="border-b border-gray-100 align-top"
                >
                  <td className="py-1.5 pr-2 tabular-nums text-gray-400">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-medium">{titleCase(p.name)}</td>
                  <td className="py-1.5 pr-2 text-gray-600">
                    {titleCase(p.city)}, {p.state}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {p.rooms != null ? p.rooms.toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                    {fmtMoney(p.revpar)}
                  </td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: BUCKET_COLORS[p.bucket] }}
                      />
                      {p.bucket === "red"
                        ? "High"
                        : p.bucket === "yellow"
                        ? "Mid"
                        : "Low"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {topRows.length === 0 && (
          <p className="py-3 text-sm text-gray-500">
            No properties in the current scope.
          </p>
        )}
      </section>

      <footer className="mt-6 border-t border-gray-200 pt-2 text-[10px] text-gray-400">
        TX Hotel RevPAR Intelligence &middot; RevPAR = period room revenue ÷
        available rooms. Figures reflect the current map filter and viewport at
        time of generation.
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="block text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
