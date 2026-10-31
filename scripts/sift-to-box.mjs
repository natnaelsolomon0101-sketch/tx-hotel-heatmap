/**
 * sift-to-box.mjs: turn raw SIFT hotel receipts files (HOTyymm.CSV, no header
 * row, the 23-field "Hotel Tax Receipt Information File" layout) into the
 * "YYYY-MON HOTEL ANALYTICS.csv" files kept in Box ("Texan Hotel Analytics"),
 * byte for byte in the same layout as the existing ones:
 *
 *   Taxpayer Name,Taxpayer Address,Taxpayer City,Taxpayer State,Taxpayer Zip,
 *   Taxpayer Phone,Location Number,Location Name,Location Address,
 *   Location City,Location State,Location Zip,Rooms, Revenue ,RevPAR
 *
 * - Text fields keep SIFT's fixed-width space padding (name 50, address 40,
 *   city 20). A space-padded number ("274" as a name, phone "832") is
 *   written trimmed, the way the Excel export did it.
 * - Revenue = Total Room Receipts in Excel accounting format: "$16,215.94 ",
 *   zero as " $-   ".
 * - RevPAR = Revenue / Rooms / 90, as in the existing files (always 90 days,
 *   even for a one-month file), "#VALUE!" when Revenue is zero. The site's
 *   pipeline ignores this column and recomputes RevPAR itself.
 * - CRLF line endings, rows in SIFT order, every row kept (zero-revenue rows
 *   and, in a quarter-end month, the quarterly filers).
 *
 *   node scripts/sift-to-box.mjs <HOT2606.CSV> [...] [--out dir]
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let OUT = ".";
const oi = args.indexOf("--out");
if (oi >= 0) { OUT = args[oi + 1]; args.splice(oi, 2); }
if (!args.length) {
  console.error("usage: node scripts/sift-to-box.mjs <HOTyymm.CSV> [...] [--out dir]");
  process.exit(1);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// Existing Box files spell April out ("2026-APRIL"); the others are 3 letters.
const monthName = (m) => (m === 3 ? "APRIL" : MONTHS[m]);
const HEADER = "Taxpayer Name,Taxpayer Address,Taxpayer City,Taxpayer State,Taxpayer Zip,Taxpayer Phone,Location Number,Location Name,Location Address,Location City,Location State,Location Zip,Rooms, Revenue ,RevPAR";

// Only a space-padded number loses its padding ("832       " -> "832",
// "0         " -> "0"); a full-width "0000000000" or an all-blank field is
// kept as-is. That is what the existing Box files show.
const asText = (v) => (/^\d+\s+$/.test(v) ? v.trim() : v);
const cell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (n) => {
  if (n === 0) return " $-   ";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `$(${s})` : `$${s} `;
};

for (const input of args) {
  const rows = parse(fs.readFileSync(input, "latin1"), { relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: false });
  const byMonth = new Map();
  for (const r of rows) {
    if (r.length < 23) throw new Error(`${input}: row with ${r.length} fields, expected 23`);
    const d = r[19].trim();
    const m = d.match(/^(\d{4})(\d{2})\d{2}$/);
    if (!m) throw new Error(`${input}: unreadable Obligation End Date "${d}" (quarter files are not converted)`);
    const name = `${m[1]}-${monthName(Number(m[2]) - 1)} HOTEL ANALYTICS.csv`;
    if (!byMonth.has(name)) byMonth.set(name, []);
    const rooms = Number(r[16].trim());
    const rev = Number(r[21].trim());
    const revpar = rev === 0 || !rooms ? "#VALUE!" : money(Math.round((rev / rooms / 90) * 100 + 1e-9) / 100);
    byMonth.get(name).push(
      [
        asText(r[1]), asText(r[2]), asText(r[3]), r[4], r[5], asText(r[7]),
        r[8], asText(r[9]), asText(r[10]), asText(r[11]), r[12], r[13],
        String(rooms), money(rev), revpar,
      ].map(cell).join(",")
    );
  }
  for (const [name, lines] of byMonth) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), [HEADER, ...lines].join("\r\n") + "\r\n", "latin1");
    console.log(`${path.basename(input)} -> ${name}: ${lines.length.toLocaleString()} rows`);
  }
}
