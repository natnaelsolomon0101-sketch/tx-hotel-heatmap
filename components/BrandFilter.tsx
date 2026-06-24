"use client";

import { BrandKey, BRAND_LABELS } from "@/lib/brands";

type BrandFilterProps = {
  /** Selected brand keys. */
  selected: Set<BrandKey>;
  /** Called when brand selection changes. */
  onChange: (brands: Set<BrandKey>) => void;
  /** Brand counts (data-driven). */
  counts: Record<BrandKey, number>;
  /** Reset handler. */
  onReset: () => void;
};

const ALL_BRANDS: BrandKey[] = [
  "hilton",
  "marriott",
  "ihg",
  "wyndham",
  "choice",
  "best-western",
  "motel-6",
  "extended-stay",
  "independent",
  "other",
];

export default function BrandFilter({
  selected,
  onChange,
  counts,
  onReset,
}: BrandFilterProps) {
  const allSelected = selected.size === ALL_BRANDS.length;

  const toggleBrand = (brand: BrandKey) => {
    const next = new Set(selected);
    if (next.has(brand)) next.delete(brand);
    else next.add(brand);
    if (next.size === 0) onChange(new Set(ALL_BRANDS));
    else onChange(next);
  };

  return (
    <div className="hidden shrink-0 rounded-panel bg-surface p-3 shadow-sm ring-1 ring-border md:block">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label-overline">Brand</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={allSelected}
          className={`text-xs font-medium transition-base ${
            allSelected
              ? "text-subtle"
              : "text-accent hover:text-[hsl(var(--accent-hover))]"
          }`}
        >
          Show all
        </button>
      </div>

      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {ALL_BRANDS.map((brand) => {
          const checked = selected.has(brand);
          return (
            <label
              key={brand}
              className="flex items-center gap-2 cursor-pointer transition-base hover:bg-muted rounded-lg px-2 py-1"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleBrand(brand)}
                className="h-4 w-4 rounded border-border accent-[hsl(var(--accent))]"
              />
              <span className="flex-1 text-sm text-foreground">
                {BRAND_LABELS[brand]}
              </span>
              <span className="text-xs font-mono tabular-nums text-subtle">
                {counts[brand].toLocaleString()}
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-2 border-t border-border pt-2 text-meta leading-snug text-subtle">
        Filter by hotel brand or brand family.
      </p>
    </div>
  );
}
