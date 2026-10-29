import { normalizePhone } from "@/lib/phone/normalize";

const phoneHints = ["phone", "mobile", "whatsapp", "telephone", "cell", "number", "tel", "dnc"];

export type DncCell = { rowNumber: number; raw: string };

export type DncPreviewStatus = "valid" | "invalid" | "duplicate_file" | "duplicate_existing";

export type DncPreviewRow = {
  rowNumber: number;
  raw: string;
  phone: string | null;
  status: DncPreviewStatus;
  reason: string | null;
};

export type DncPreview = {
  rows: DncPreviewRow[];
  counts: { valid: number; invalid: number; duplicateFile: number; duplicateExisting: number };
  insertable: string[];
};

function headerValue(header: string) {
  return header.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function phoneScore(header: string) {
  const value = headerValue(header);
  if (!value) return 0;
  if (phoneHints.some((hint) => value === hint)) return 3;
  if (phoneHints.some((hint) => value.split(" ").includes(hint))) return 2;
  if (phoneHints.some((hint) => value.includes(hint))) return 1;
  return 0;
}

export function collectDncCells(headers: string[], rows: string[][]): { cells: DncCell[] } | { error: string } {
  let index = -1;
  let best = 0;
  headers.forEach((header, column) => {
    const score = phoneScore(header);
    if (score > best) {
      best = score;
      index = column;
    }
  });
  if (index < 0 && headers.length === 1) index = 0;
  if (index < 0) return { error: "Add a Phone column, or use a file with one column of numbers." };

  const cells: DncCell[] = [];
  const headerRaw = headers[index] ?? "";
  if (normalizePhone(headerRaw).ok) cells.push({ rowNumber: 1, raw: headerRaw });
  rows.forEach((row, rowIndex) => {
    const raw = row[index] ?? "";
    if (raw.trim()) cells.push({ rowNumber: rowIndex + 2, raw });
  });
  if (cells.length === 0) return { error: "This file has no phone numbers." };
  return { cells };
}

export function previewDncImport(cells: DncCell[], existing: Set<string>): DncPreview {
  const seen = new Set<string>();
  const rows: DncPreviewRow[] = [];
  const counts = { valid: 0, invalid: 0, duplicateFile: 0, duplicateExisting: 0 };

  for (const cell of cells) {
    const phone = normalizePhone(cell.raw);
    if (!phone.ok) {
      counts.invalid += 1;
      rows.push({
        rowNumber: cell.rowNumber,
        raw: cell.raw,
        phone: null,
        status: "invalid",
        reason: phone.reason === "empty" ? "Phone number is empty." : "Phone number is not a valid number.",
      });
      continue;
    }
    if (seen.has(phone.e164)) {
      counts.duplicateFile += 1;
      rows.push({
        rowNumber: cell.rowNumber,
        raw: cell.raw,
        phone: phone.e164,
        status: "duplicate_file",
        reason: "Duplicate in this file.",
      });
      continue;
    }
    seen.add(phone.e164);
    if (existing.has(phone.e164)) {
      counts.duplicateExisting += 1;
      rows.push({
        rowNumber: cell.rowNumber,
        raw: cell.raw,
        phone: phone.e164,
        status: "duplicate_existing",
        reason: "Already on your do-not-call list.",
      });
      continue;
    }
    counts.valid += 1;
    rows.push({
      rowNumber: cell.rowNumber,
      raw: cell.raw,
      phone: phone.e164,
      status: "valid",
      reason: null,
    });
  }

  return {
    rows,
    counts,
    insertable: rows.flatMap((row) => (row.status === "valid" && row.phone ? [row.phone] : [])),
  };
}
