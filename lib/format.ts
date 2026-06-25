// Shared, cached display formatters. The Intl.NumberFormat instances are built
// once at module scope so per-row renders reuse them instead of constructing a
// fresh formatter on every cell.

const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat("en-US");

/** Currency, no decimals. `$1,234`. null/undefined → em-dash placeholder. */
export function money(n: number | null | undefined): string {
  return n == null ? "—" : USD0.format(n);
}

/** Thousands-separated integer. `1,234`. */
export function int(n: number): string {
  return INT.format(n);
}

/** Title-case each word: "hilton DALLAS" → "Hilton Dallas". */
export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}
