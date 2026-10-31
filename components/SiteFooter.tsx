"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  BASEMAP_CREDIT,
  CONTACT_PROMPT,
  CONTACTS,
  FOOTER_DISCLOSURE,
  ONE_LINE_CREDIT,
} from "@/lib/disclaimer";

const LINK_CLS = "text-accent hover:opacity-80";

/** "Luke Thompson · (512) 771-1860 · Luke.Thompson@matthews.com" for each
 *  contact; `withEmail={false}` drops the email for the narrow phone strip. */
function ContactList({ withEmail = true }: { withEmail?: boolean }) {
  return (
    <>
      {CONTACTS.map((c, i) => (
        <Fragment key={c.email}>
          {i > 0 && " "}
          <span className="whitespace-nowrap">
            {i > 0 && "| "}
            {c.name} ·{" "}
            <a href={`tel:${c.tel}`} className={LINK_CLS}>
              {c.phone}
            </a>
            {withEmail && (
              <>
                {" "}
                ·{" "}
                <a href={`mailto:${c.email}`} className={LINK_CLS}>
                  {c.email}
                </a>
              </>
            )}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Persistent contact line + attribution + disclaimer, shown on every screen.
 * Also carries the basemap credit, since the map's own attribution badge is
 * off.
 *
 * - md and up: a pill at the bottom, centered in the map area left of the
 *   side panel and zoom controls (right padding = panel + zoom column), so it
 *   never covers either: the contact line, then the disclosure (full on wide
 *   screens, the one-line credit on narrower ones).
 * - Phones: a thin full-width strip docked to the bottom edge (~42px): the
 *   contacts' phone numbers on one line, the source credit on the next. The
 *   list sheet, compare tray and coachmark sit above it (bottom-11), so it
 *   never covers list rows; the full-height card and compset sheets (z-30)
 *   cover it. Tapping the credit expands both lines in full (with emails).
 */
export default function SiteFooter() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Phones */}
      <div className="fixed inset-x-0 bottom-0 z-[25] border-t border-border bg-surface/95 text-subtle backdrop-blur print:hidden md:hidden">
        <p
          className={`px-3 pt-1 text-[10px] font-medium leading-tight text-foreground ${
            open ? "" : "truncate"
          }`}
        >
          {open && <>{CONTACT_PROMPT} </>}
          <ContactList withEmail={open} />
        </p>
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
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden justify-center pb-1 pl-4 pr-[24.5rem] print:hidden md:flex">
        <div className="pointer-events-auto flex max-w-4xl flex-col items-center rounded-t-lg bg-surface/85 px-3 py-1 text-subtle shadow-sm ring-1 ring-border backdrop-blur">
          <p className="text-center text-[11px] leading-tight font-medium text-foreground">
            {CONTACT_PROMPT} <ContactList />
          </p>
          <div className="flex items-center gap-2">
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
      </div>
    </>
  );
}
