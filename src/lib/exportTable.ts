/**
 * Client-side table export helpers. `downloadCSV` writes a UTF-8 CSV (Excel
 * opens it natively); `downloadExcel` writes an .xls workbook as an HTML table
 * with the Excel MIME type — no dependency, opens directly in Excel. Both take
 * the same (headers, rows) shape so a caller can offer either format from one
 * row-builder.
 */

type Cell = string | number | null | undefined;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toText(value: Cell): string {
  return value === null || value === undefined ? "" : String(value);
}

function escapeCsv(value: Cell): string {
  return `"${toText(value).replace(/"/g, '""')}"`;
}

function escapeHtml(value: Cell): string {
  return toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function downloadCSV(filename: string, headers: string[], rows: Cell[][]): void {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ];
  // Leading BOM so Excel reads UTF-8 (accents, °, ›) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadExcel(filename: string, headers: string[], rows: Cell[][]): void {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".xls") ? filename : `${filename}.xls`);
}
