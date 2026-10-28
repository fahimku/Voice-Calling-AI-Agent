import Papa from "papaparse";
import * as XLSX from "xlsx";

import { importLimitError, MAX_IMPORT_ROWS } from "@/lib/leads/preview";

export type ParsedTable = {
  headers: string[];
  rows: string[][];
};

function asText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function tableFromMatrix(matrix: unknown[][]): { table: ParsedTable } | { error: string } {
  const rows = matrix.map((row) => (Array.isArray(row) ? row.map((cell) => asText(cell)) : []));
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const padded = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const headerIndex = padded.findIndex((row) => row.some((cell) => cell !== ""));
  if (headerIndex < 0) return { error: "This file needs a header row." };

  const headers = padded[headerIndex] ?? [];
  const dataRows = padded.slice(headerIndex + 1).filter((row) => row.some((cell) => cell !== ""));
  if (dataRows.length === 0) return { error: "This file has no lead rows." };

  const limit = importLimitError(0, dataRows.length);
  if (limit) return { error: limit };
  if (dataRows.length > MAX_IMPORT_ROWS) return { error: "This file has more than 5,000 rows." };

  return { table: { headers, rows: dataRows } };
}

export function parseCsvText(text: string): { table: ParsedTable } | { error: string } {
  const parsed = Papa.parse<unknown[]>(text, { skipEmptyLines: "greedy" });
  if (parsed.data.length === 0) return { error: "Could not read this CSV file." };
  return tableFromMatrix(parsed.data);
}

export function parseWorkbook(data: ArrayBuffer): { table: ParsedTable } | { error: string } {
  const book = XLSX.read(data, { type: "array" });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return { error: "This workbook has no sheets." };
  const sheet = book.Sheets[sheetName];
  if (!sheet) return { error: "Could not read the first sheet." };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  return tableFromMatrix(matrix);
}

export function fileKind(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return "csv" as const;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel" as const;
  return null;
}
