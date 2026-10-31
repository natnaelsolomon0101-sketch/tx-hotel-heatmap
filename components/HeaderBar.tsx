"use client";

import { ReactNode } from "react";
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
      <span className="label-overline">{label}</span>
      <span className="text-data text-foreground">{value}</span>
    </div>
  );
}

export default function HeaderBar({
  stats,
  period,
  dataAge,
  refreshState = "idle",
  onRefresh,
  actions,
}: {
  stats: PortfolioStats;
  period: string;
  // Whole days since the data last loaded; null before the first load resolves.
  dataAge?: number | null;
  // Refresh button feedback state, mirrored from MapView.
  refreshState?: "idle" | "loading" | "refreshed";
  onRefresh?: () => void;
  // Right-aligned action buttons (share / theme / brief). Rendered inside the
  // header's flex row so they never overlap the stat cluster.
  actions?: ReactNode;
}) {
  // Only call out staleness once the data is more than a day old.
  const stale = dataAge != null && dataAge > 1;
  const refreshLabel =
    refreshState === "loading"
      ? "Refreshing data"
      : refreshState === "refreshed"
      ? "Data refreshed"
      : "Refresh data";
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 bg-surface/90 px-3 shadow-sm ring-1 ring-border backdrop-blur md:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-surface">
          {/* Texas outline with three hotel pins (same mark as app/icon.svg) */}
          <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6" fill="none">
            <path
              d="M9.4 1.6 L14.8 1.6 L14.8 11.2 L23.5 10.9 L25 11.3 L26.2 17.5 L22.6 19.6 L19 22 L16.6 25.6 L16 30.2 L14.2 26.2 L11.8 22.6 L10 19.8 L8.4 20.9 L6.1 18.2 L1.6 14.9 L9.4 14.9 Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            <path
              d="M15.5 13 L19 20.4 M15.5 13 L13.9 20.7 M13.9 20.7 L19 20.4"
              stroke="currentColor"
              strokeWidth={0.9}
              opacity={0.45}
            />
            <circle cx="15.5" cy="13" r="2" fill="#ef4444" />
            <circle cx="19" cy="20.4" r="1.5" fill="#f59e0b" />
            <circle cx="13.9" cy="20.7" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-display truncate text-foreground">
            Texas Hotel Data{" "}
            <span className="ml-0.5 inline-flex -translate-y-px items-center rounded-md bg-[hsl(var(--accent)/0.12)] px-1.5 font-mono text-[0.72em] font-semibold text-accent ring-1 ring-[hsl(var(--accent)/0.25)]">
              AI
            </span>
          </h1>
          <p className="text-meta hidden items-center gap-1.5 text-subtle sm:flex">
            <span className="truncate">Texas Comptroller data · {period}</span>
            {stale && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-[hsl(var(--warning)/0.12)] px-2 py-0.5 text-meta font-medium text-warning ring-1 ring-[hsl(var(--warning)/0.25)]">
                ~{dataAge}d old
              </span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshState === "loading"}
                aria-label={refreshLabel}
                title={refreshLabel}
                className="transition-base inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border hover:text-foreground disabled:cursor-default disabled:opacity-100"
              >
                {refreshState === "loading" ? (
                  // spinner
                  <svg
                    aria-hidden="true"
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
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-positive"
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
                    aria-hidden="true"
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

      {/* Centered "Powered by MATTHEWS" mark, wide screens only. */}
      <div
        aria-label="Powered by Matthews Real Estate Investment Services"
        className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center leading-none xl:flex"
      >
        <span className="text-[8px] font-semibold uppercase tracking-[0.34em] text-subtle">
          Powered by
        </span>
        <span className="mt-0.5 text-[15px] font-extrabold tracking-[0.26em] text-[#14284B] dark:text-[#DCE4F2]">
          MATTHEWS
          <span className="align-super text-[7px] font-bold tracking-normal">
            ™
          </span>
        </span>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-4 md:gap-6">
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
        {actions && (
          <div className="flex shrink-0 items-center gap-2 pl-1">{actions}</div>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {refreshState === "loading"
          ? "Refreshing data"
          : refreshState === "refreshed"
          ? "Data refreshed"
          : ""}
      </span>
    </header>
  );
}
