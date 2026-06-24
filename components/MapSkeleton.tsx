"use client";

/**
 * Animated loading skeleton shown while the map bundle (deck.gl + Google Maps)
 * loads. Mirrors the real layout: a header bar across the top and the right-hand
 * column of stacked panels. Pure CSS shimmer, zero deps.
 */

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200/80 ${className}`}
      aria-hidden
    />
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/95 p-3 shadow-card ring-1 ring-black/5 backdrop-blur">
      {children}
    </div>
  );
}

export default function MapSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="relative h-screen w-screen overflow-hidden bg-[#eceff1]"
    >
      {/* faint moving sheen over the map area */}
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#eceff1] via-[#f4f6f7] to-[#e4e8ea]" />

      {/* header bar mock — matches HeaderBar h-14 */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-black/5 bg-white/90 px-3 backdrop-blur md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-lg bg-gray-900/90 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
              <circle cx="12" cy="11" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Shimmer className="h-3 w-40" />
            <Shimmer className="hidden h-2 w-28 sm:block" />
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex flex-col gap-1.5">
            <Shimmer className="h-2 w-10" />
            <Shimmer className="h-3 w-12" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Shimmer className="h-2 w-12" />
            <Shimmer className="h-3 w-14" />
          </div>
          <div className="hidden flex-col gap-1.5 lg:flex">
            <Shimmer className="h-2 w-12" />
            <Shimmer className="h-3 w-14" />
          </div>
          <div className="hidden flex-col gap-1.5 lg:flex">
            <Shimmer className="h-2 w-16" />
            <Shimmer className="h-3 w-20" />
          </div>
        </div>
      </header>

      {/* right column mock — matches md:top-[68px] right-4 w-80 */}
      <div className="absolute right-4 top-[68px] z-20 hidden w-80 flex-col gap-3 md:flex">
        {/* legend / filter panel */}
        <Panel>
          <Shimmer className="mb-3 h-2.5 w-24" />
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Shimmer className="h-2.5 w-2.5 rounded-full" />
                <Shimmer className="h-2.5 flex-1" />
                <Shimmer className="h-2.5 w-8" />
              </div>
            ))}
          </div>
        </Panel>

        {/* property list panel */}
        <Panel>
          <div className="mb-2 flex items-baseline justify-between">
            <Shimmer className="h-2.5 w-20" />
            <Shimmer className="h-2 w-14" />
          </div>
          <Shimmer className="mb-2 h-8 w-full" />
          <div className="mb-3 flex gap-2">
            <Shimmer className="h-6 flex-1" />
            <Shimmer className="h-6 w-12" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Shimmer className="h-2.5 w-2.5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Shimmer className="h-3 w-3/4" />
                  <Shimmer className="h-2 w-1/2" />
                </div>
                <div className="shrink-0 space-y-1.5 text-right">
                  <Shimmer className="ml-auto h-3 w-12" />
                  <Shimmer className="ml-auto h-2 w-8" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* tool rail mock — left */}
      <div className="absolute left-4 top-[68px] z-20 hidden flex-col gap-2 md:flex">
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} className="h-9 w-9 rounded-xl bg-white/95 shadow-card" />
        ))}
      </div>

      {/* mobile bottom sheet mock */}
      <div className="absolute inset-x-2 bottom-2 z-20 md:hidden">
        <Panel>
          <Shimmer className="mb-2 h-3 w-32" />
          <Shimmer className="h-8 w-full" />
        </Panel>
      </div>

      {/* centered status caption */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-medium text-gray-500 shadow-card ring-1 ring-black/5 backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.2-8.6" />
          </svg>
          Loading 10,655 Texas hotels…
        </div>
      </div>

      <span className="sr-only">Loading map…</span>
    </div>
  );
}
