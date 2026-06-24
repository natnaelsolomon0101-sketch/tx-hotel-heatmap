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
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
        {value}
      </span>
    </div>
  );
}

export default function HeaderBar({
  stats,
  period,
  dataAge,
  refreshState = "idle",
  onRefresh,
}: {
  stats: PortfolioStats;
  period: string;
  // Whole days since the data last loaded; null before the first load resolves.
  dataAge?: number | null;
  // Refresh button feedback state, mirrored from MapView.
  refreshState?: "idle" | "loading" | "refreshed";
  onRefresh?: () => void;
}) {
  // Only call out staleness once the data is more than a day old.
  const stale = dataAge != null && dataAge > 1;
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-black/5 bg-white/90 px-3 backdrop-blur dark:border-white/10 dark:bg-gray-900/90 md:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900">
          {/* simple RevPAR pin mark */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
            <circle cx="12" cy="11" r="2.2" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight text-gray-900 dark:text-gray-50">
            TX Hotel RevPAR Intelligence
          </h1>
          <p className="hidden items-center gap-1.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400 sm:flex">
            <span className="truncate">
              Texas Comptroller data · {period}
              {stale && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  · data ~{dataAge} days old
                </span>
              )}
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshState === "loading"}
                aria-label="Refresh data"
                title="Refresh data"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition hover:text-gray-700 disabled:cursor-default disabled:opacity-100 dark:text-gray-500 dark:hover:text-gray-200"
              >
                {refreshState === "loading" ? (
                  // spinner
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  </svg>
                ) : refreshState === "refreshed" ? (
                  // checkmark
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  // refresh arrows
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 2v6h-6M3 22v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L21 8M21 15a9 9 0 0 1-14.85 3.36L3 16" />
                  </svg>
                )}
              </button>
            )}
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
