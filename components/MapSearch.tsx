"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HotelFeature } from "@/lib/types";

// Floating search over the FULL hotel dataset (independent of the active map
// filters). Type a street address, hotel name, city, or ZIP; pick a result to
// fly there and open its property card.
export default function MapSearch({
  features,
  onSelect,
}: {
  features: HotelFeature[];
  onSelect: (f: HotelFeature) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = term.trim().toLowerCase();

  // Precompute a normalized "haystack" per hotel (name + address + city +
  // state + zip) so every keystroke is a cheap scan even on 5k+ hotels.
  const rows = useMemo(
    () =>
      features.map((f) => {
        const p = f.properties;
        const norm = (s: string) => s.toLowerCase().replace(/[.,#]/g, " ");
        return {
          f,
          hay: norm(
            [p.name, p.address, p.city, p.state, p.zip]
              .filter(Boolean)
              .join(" ")
          ),
          addr: norm(p.address || ""),
          name: norm(p.name || ""),
        };
      }),
    [features]
  );

  // Tokenized AND match: split the query on spaces/punctuation and require
  // EVERY token to appear somewhere in the hotel's fields. This makes a full
  // formatted address ("600 W 2nd St, Austin, TX 78701") match even though the
  // street, city, state, and ZIP are stored in separate fields. Rank hotels
  // whose street address contains the first token (usually the house number)
  // ahead of incidental name/city matches.
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    const tokens = q.replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const out: { f: HotelFeature; score: number }[] = [];
    for (const r of rows) {
      if (!tokens.every((t) => r.hay.includes(t))) continue;
      const t0 = tokens[0];
      const score = r.addr.includes(t0) ? 0 : r.name.includes(t0) ? 1 : 2;
      out.push({ f: r.f, score });
      if (out.length > 400) break;
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, 8).map((s) => s.f);
  }, [q, rows]);

  useEffect(() => setActive(0), [q]);

  // Dismiss the dropdown on any outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (f: HotelFeature) => {
    onSelect(f);
    setTerm(f.properties.name || f.properties.address || "");
    setOpen(false);
  };

  const showList = open && q.length >= 2;

  return (
    <div className="pointer-events-none absolute inset-x-2 top-[62px] z-30 print:hidden md:inset-x-auto md:left-4 md:top-[70px] md:w-[380px]">
      <div ref={boxRef} className="pointer-events-auto">
        <div className="flex items-center gap-2 rounded-panel bg-surface px-3 py-2 shadow-md ring-1 ring-border backdrop-blur">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (matches[active]) choose(matches[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            type="text"
            placeholder="Search by address, hotel, city, or ZIP"
            aria-label="Search hotels by address"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setTerm("");
                setOpen(false);
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        {showList && (
          <div className="mt-1.5 max-h-[52vh] overflow-y-auto rounded-panel bg-surface py-1 shadow-lg ring-1 ring-border">
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No hotels match “{term.trim()}”.
              </div>
            ) : (
              matches.map((f, i) => {
                const p = f.properties;
                return (
                  <button
                    key={(p.id ?? `${p.name}-${i}`).toString()}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(f)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
                      i === active ? "bg-muted" : "hover:bg-muted"
                    }`}
                  >
                    <span className="w-full truncate text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {[p.address, p.city, p.state, p.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
