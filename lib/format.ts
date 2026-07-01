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
  // Capitalize the first letter of every alphanumeric run, treating spaces,
  // hyphens and slashes as boundaries ("SUITES-AUSTIN/AIRPORT" ->
  // "Suites-Austin/Airport"), but not apostrophes ("WENDY'S" -> "Wendy's").
  return s
    .toLowerCase()
    .replace(/(^|[^a-z0-9'])([a-z0-9])/g, (_, sep, ch) => sep + ch.toUpperCase());
}
