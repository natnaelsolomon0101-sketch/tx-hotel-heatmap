"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BASEMAP_CREDIT,
  FOOTER_DISCLOSURE,
  ONE_LINE_CREDIT,
} from "@/lib/disclaimer";

/**
 * Persistent attribution + disclaimer, shown on every screen. Also carries the
 * basemap credit, since the map's own attribution badge is off.
 *
 * - md and up: a centered pill at the bottom, clear of the map's corner
 *   controls (zoom bottom-right). Full disclosure on wide screens, the
 *   one-line credit on narrower ones.
 * - Phones: a thin full-width strip docked to the bottom edge (~24px). The
 *   list sheet, compare tray and coachmark sit above it (bottom-8), so it
 *   never covers list rows; the full-height card and compset sheets (z-30)
 *   cover it. It shows one truncated line and expands on tap.
 */
export default function SiteFooter() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Phones */}
      <div className="fixed inset-x-0 bottom-0 z-[25] border-t border-border bg-surface/95 text-subtle backdrop-blur print:hidden md:hidden">
        <div className="flex min-h-6 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`min-w-0 flex-1 py-1 text-left text-[10px] leading-tight ${
              open ? "" : "truncate"
            }`}
          >
            {ONE_LINE_CREDIT} {BASEMAP_CREDIT}
          </button>
          <Link
            href="/about"
            className="shrink-0 text-[10px] font-medium text-accent underline underline-offset-2"
          >
            About
          </Link>
        </div>
      </div>

      {/* Tablet / desktop */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden justify-center px-16 pb-1 print:hidden md:flex">
        <div className="pointer-events-auto flex max-w-3xl items-center gap-2 rounded-t-lg bg-surface/85 px-3 py-1 text-subtle shadow-sm ring-1 ring-border backdrop-blur">
          <p className="text-[11px] leading-tight">
            <span className="hidden lg:inline">{FOOTER_DISCLOSURE}</span>
            <span className="lg:hidden">{ONE_LINE_CREDIT}</span>{" "}
            <span className="whitespace-nowrap">{BASEMAP_CREDIT}</span>
          </p>
          <Link
            href="/about"
            className="text-[11px] font-medium whitespace-nowrap text-accent underline underline-offset-2 hover:opacity-80"
          >
            About the data
          </Link>
        </div>
      </div>
    </>
  );
}
