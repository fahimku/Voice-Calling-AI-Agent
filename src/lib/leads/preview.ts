import { normalizePhone, type PhoneRejectReason } from "@/lib/phone/normalize";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const PREVIEW_ROW_LIMIT = 20;

const phoneHints = ["phone", "mobile", "whatsapp", "telephone", "cell", "number", "tel"];
const nameHints = ["name", "customer"];

export type PreviewStatus = "valid" | "invalid" | "duplicate_file" | "duplicate_existing" | "dnc";

export type MappedLeadRow = {
  rowNumber: number;
  rawName: string;
  rawPhone: string;
  extra: Record<string, string>;
};

export type PreviewRow = {
  rowNumber: number;
  name: string | null;
  rawName: string;
  rawPhone: string;
  phone: string | null;
  extra: Record<string, string>;
  status: PreviewStatus;
  reason: string | null;
};

export type ImportPreview = {
  rows: PreviewRow[];
  counts: {
    valid: number;
    invalid: number;
    duplicateFile: number;
    duplicateExisting: number;
    dnc: number;
  };
  insertable: Array<{ name: string | null; phone: string; rawPhone: string; extra: Record<string, string> }>;
};

const reasonText: Record<PhoneRejectReason | Exclude<PreviewStatus, "valid" | "invalid">, string> = {
  empty: "Phone number is empty.",
  invalid: "Phone number is not a valid number.",
  duplicate_file: "Duplicate in this file.",
  duplicate_existing: "Already in this campaign.",
  dnc: "On your do-not-call list.",
};

function headerValue(header: string) {
  return header.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function hintScore(header: string, hints: string[]) {
  const value = headerValue(header);
  if (!value) return 0;
  if (hints.some((hint) => value === hint)) return 3;
  const words = value.split(" ");
  if (hints.some((hint) => words.includes(hint))) return 2;
  if (hints.some((hint) => value.includes(hint))) return 1;
  return 0;
}

export function detectColumns(headers: string[]) {
  let nameIndex: number | null = null;
  let phoneIndex: number | null = null;
  let nameScore = 0;
  let phoneScore = 0;

  headers.forEach((header, index) => {
    const name = hintScore(header, nameHints);
    const phone = hintScore(header, phoneHints);
    const contactOnly = /\bcontact\b/i.test(header) && name === 0 ? 2 : 0;
    const phoneTotal = Math.max(phone, contactOnly);

    if (name > nameScore) {
      nameScore = name;
      nameIndex = index;
    }
    if (phoneTotal > phoneScore) {
      phoneScore = phoneTotal;
      phoneIndex = index;
    }
  });

  if (nameIndex !== null && nameIndex === phoneIndex) {
    if (nameScore >= phoneScore) phoneIndex = null;
    else nameIndex = null;
  }

  return { nameIndex, phoneIndex };
}

export function cleanLeadName(value: string): string | null {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    // TODO: When the Vapi call is placed, default a missing name in the assistant
    // variable so the greeting does not become "Hi, is this there?".
    return null;
  }
  return collapsed.slice(0, 200);
}

function cell(value: string | undefined) {
  return (value ?? "").trim();
}

export function mapLeadRows(headers: string[], dataRows: string[][], nameIndex: number, phoneIndex: number) {
  const rows: MappedLeadRow[] = [];

  dataRows.forEach((dataRow, index) => {
    if (dataRow.every((value) => cell(value) === "")) return;

    const extra: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (column === nameIndex || column === phoneIndex) return;
      const value = cell(dataRow[column]).slice(0, 500);
      if (!value || Object.keys(extra).length >= 30) return;
      const key = (header.trim() || `Column ${column + 1}`).slice(0, 80);
      extra[key] = value;
    });

    rows.push({
      rowNumber: index + 2,
      rawName: nameIndex >= 0 ? cell(dataRow[nameIndex]) : "",
      rawPhone: cell(dataRow[phoneIndex]),
      extra,
    });
  });

  return rows;
}

export function previewImport(
  rows: MappedLeadRow[],
  existing: ReadonlySet<string>,
  dnc: ReadonlySet<string>,
): ImportPreview {
  const seen = new Set<string>();
  const previewRows: PreviewRow[] = [];
  const counts = { valid: 0, invalid: 0, duplicateFile: 0, duplicateExisting: 0, dnc: 0 };
  const insertable: ImportPreview["insertable"] = [];

  for (const row of rows) {
    const name = cleanLeadName(row.rawName);
    const phone = normalizePhone(row.rawPhone);
    let status: PreviewStatus;
    let reason: string | null = null;
    let e164: string | null = null;

    if (!phone.ok) {
      status = "invalid";
      reason = reasonText[phone.reason];
      counts.invalid += 1;
    } else if (seen.has(phone.e164)) {
      status = "duplicate_file";
      reason = reasonText.duplicate_file;
      e164 = phone.e164;
      counts.duplicateFile += 1;
    } else if (dnc.has(phone.e164)) {
      status = "dnc";
      reason = reasonText.dnc;
      e164 = phone.e164;
      counts.dnc += 1;
    } else if (existing.has(phone.e164)) {
      status = "duplicate_existing";
      reason = reasonText.duplicate_existing;
      e164 = phone.e164;
      counts.duplicateExisting += 1;
    } else {
      status = "valid";
      e164 = phone.e164;
      counts.valid += 1;
      insertable.push({ name, phone: phone.e164, rawPhone: row.rawPhone, extra: row.extra });
    }

    if (phone.ok) seen.add(phone.e164);

    previewRows.push({
      rowNumber: row.rowNumber,
      name,
      rawName: row.rawName,
      rawPhone: row.rawPhone,
      phone: e164,
      extra: row.extra,
      status,
      reason,
    });
  }

  return { rows: previewRows, counts, insertable };
}

export function importLimitError(byteSize: number, dataRowCount: number) {
  if (byteSize > MAX_IMPORT_BYTES) return "This file is larger than 5 MB.";
  if (dataRowCount > MAX_IMPORT_ROWS) return "This file has more than 5,000 rows.";
  return null;
}
