"use client";

import { PortfolioStats, fmtMoney, fmtMarket } from "@/lib/stats";

function Stat({
  label,
  value,
  hideOnMobile,
}: {
  label: string;
  value: string;
  hideOnMobile?: boolean;
}) {
  return (
    <div
      className={`flex flex-col leading-tight ${
        hideOnMobile ? "hidden lg:flex" : ""
      }`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-gray-900">
        {value}
      </span>
    </div>
  );
}

export default function HeaderBar({
  stats,
  period,
}: {
  stats: PortfolioStats;
  period: string;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-black/5 bg-white/90 px-3 backdrop-blur md:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
          {/* simple RevPAR pin mark */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
            <circle cx="12" cy="11" r="2.2" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight text-gray-900">
            TX Hotel RevPAR Intelligence
          </h1>
          <p className="hidden text-[11px] leading-tight text-gray-500 sm:block">
            Texas Comptroller data · {period}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <Stat label="Hotels" value={stats.total.toLocaleString()} />
        <Stat label="Avg RevPAR" value={fmtMoney(stats.avgRevpar)} />
        <Stat
          label="Median"
          value={fmtMoney(stats.medianRevpar)}
          hideOnMobile
        />
        <Stat
          label="Top market"
          value={fmtMarket(stats.topMarket)}
          hideOnMobile
        />
      </div>
    </header>
  );
}
