import { sanitizeSheetCell } from "@/lib/sheets/cells";
import { planHeaders, quoteTab, type HeaderPlan } from "@/lib/sheets/headers";
import { sheetsErrorStatus } from "@/lib/sheets/retry";

export const SHEET_BATCH_SIZE = 100;
export const DIRTY_LEAD_LIMIT = 200;

export type ValueRange = { range: string; values: string[][] };

export type SheetsApi = {
  getSpreadsheet(sheetId: string): Promise<{ titles: string[] }>;
  getValues(sheetId: string, range: string): Promise<string[][]>;
  batchUpdate(sheetId: string, data: ValueRange[]): Promise<void>;
  append(sheetId: string, range: string, values: string[][]): Promise<{ startRow: number | null }>;
};

export class SheetAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetAccessError";
  }
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function rowFromUpdatedRange(updatedRange: string | null | undefined) {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+)/i);
  if (!match?.[1]) return null;
  const row = Number(match[1]);
  return Number.isInteger(row) && row >= 1 ? row : null;
}

export function permissionHint(email: string) {
  const who = email.trim() || "the service account";
  return `Share the sheet with ${who} as Editor.`;
}

export async function verifyAccess(api: SheetsApi, sheetId: string, tab: string, email: string) {
  let titles: string[];
  try {
    const spreadsheet = await api.getSpreadsheet(sheetId);
    titles = spreadsheet.titles;
  } catch (error) {
    if (error instanceof SheetAccessError) throw error;
    const status = sheetsErrorStatus(error);
    if (status === 404) throw new SheetAccessError("This Google Sheet was not found.");
    if (status === 403) throw new SheetAccessError(permissionHint(email));
    throw error;
  }
  if (!titles.includes(tab)) throw new SheetAccessError(`The tab "${tab}" is missing.`);
}

export async function readRows(api: SheetsApi, sheetId: string, tab: string) {
  const values = await api.getValues(sheetId, quoteTab(tab));
  const headers = (values[0] ?? []).map((cell) => String(cell ?? ""));
  const rows = values.slice(1).map((cells, index) => ({
    sheetRow: index + 2,
    cells: cells.map((cell) => String(cell ?? "")),
  }));
  return { headers, rows };
}

export async function batchWriteRows(api: SheetsApi, sheetId: string, data: ValueRange[]) {
  for (const part of chunk(data, SHEET_BATCH_SIZE)) {
    if (part.length === 0) continue;
    await api.batchUpdate(sheetId, part);
  }
}

export async function appendRows(
  api: SheetsApi,
  sheetId: string,
  tab: string,
  rows: Array<{ leadId: string; values: string[]; sheetRow: number }>,
) {
  const saved: Array<{ id: string; sheetRow: number }> = [];
  for (const part of chunk(rows, SHEET_BATCH_SIZE)) {
    const result = await api.append(
      sheetId,
      quoteTab(tab),
      part.map((row) => row.values),
    );
    part.forEach((row, index) => {
      saved.push({
        id: row.leadId,
        sheetRow: result.startRow != null ? result.startRow + index : row.sheetRow,
      });
    });
  }
  return saved;
}

export async function ensureHeaders(api: SheetsApi, sheetId: string, tab: string, existingHeaders: string[]) {
  const layout: HeaderPlan = planHeaders(existingHeaders);
  if (!layout.changed) return layout;
  await batchWriteRows(api, sheetId, [
    {
      range: `${quoteTab(tab)}!A1`,
      values: [layout.headers.map((header) => sanitizeSheetCell(header))],
    },
  ]);
  return layout;
}
