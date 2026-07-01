"use client";

import Link from "next/link";
import { FOOTER_DISCLOSURE, ONE_LINE_CREDIT } from "@/lib/disclaimer";

/**
 * Persistent attribution + disclaimer, shown on every screen. Centered at the
 * bottom so it clears the map's corner controls (Google logo bottom-left, zoom
 * bottom-right). Shows the full disclosure on wide screens and the one-line
 * credit on narrow ones; both link to the full "About the Data" page.
 */
export default function SiteFooter() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-16 pb-1 print:hidden">
      <div className="pointer-events-auto flex max-w-3xl items-center gap-2 rounded-t-lg bg-surface/85 px-3 py-1 text-subtle shadow-sm ring-1 ring-border backdrop-blur">
        <p className="text-[11px] leading-tight">
          <span className="hidden lg:inline">{FOOTER_DISCLOSURE}</span>
          <span className="lg:hidden">{ONE_LINE_CREDIT}</span>
        </p>
        <Link
          href="/about"
          className="text-[11px] font-medium whitespace-nowrap text-accent underline underline-offset-2 hover:opacity-80"
        >
          About the data
        </Link>
      </div>
    </div>
  );
}
