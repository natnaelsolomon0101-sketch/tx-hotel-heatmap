import { HotelFeature } from "./types";

const XLS_HEADER = [
  "Name",
  "Address",
  "City",
  "State",
  "ZIP",
  "Rooms",
  "RevPAR",
  "ADR",
  "Occupancy",
  "Revenue",
  "Bucket",
  "Longitude",
  "Latitude",
] as const;

/** Format a value for safe HTML table cell display. */
const escapeHtml = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/** Build an HTML table string suitable for .xls import (Excel reads HTML in .xls files). */
export function buildXls(features: HotelFeature[]): string {
  const rows = [
    `<tr>${XLS_HEADER.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`,
  ];

  for (const f of features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    rows.push(
      `<tr>` +
        [
          p.name,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.rooms,
          p.revpar,
          p.adr,
          p.occupancy != null ? (p.occupancy * 100).toFixed(1) + "%" : "",
          p.revenue,
          p.bucket,
          lng.toFixed(6),
          lat.toFixed(6),
        ]
          .map((v) => `<td>${escapeHtml(v)}</td>`)
          .join("") +
        `</tr>`
    );
  }

  // Excel-friendly HTML wrapper: minimal but valid HTML with UTF-8 encoding.
  return (
    `<html>` +
    `<head><meta charset="UTF-8"></head>` +
    `<body><table border="1" cellpadding="2" cellspacing="0">` +
    rows.join("") +
    `</table></body>` +
    `</html>`
  );
}

/** Trigger a browser download of features as an Excel-compatible .xls file. */
export function downloadXls(features: HotelFeature[], filename: string): void {
  const blob = new Blob([buildXls(features)], {
    type: "application/vnd.ms-excel;charset=UTF-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
