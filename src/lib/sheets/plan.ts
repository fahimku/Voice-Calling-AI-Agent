import { callLink, sanitizeSheetCell } from "@/lib/sheets/cells";
import {
  columnLetter,
  contiguousRuns,
  quoteTab,
  RESULT_HEADERS,
  type HeaderPlan,
  type ResultHeader,
} from "@/lib/sheets/headers";
import { normalizePhone } from "@/lib/phone/normalize";

export type DirtyLead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  interest: string | null;
  callbackAt: string | null;
  attempts: number;
  lastCallAt: string | null;
  summary: string | null;
  notes: string | null;
  sheetRow: number | null;
  callId: string | null;
};

export type SheetGridRow = { sheetRow: number; cells: string[] };

export type PlannedRange = { range: string; values: string[][] };

export type PlannedUpdate = {
  leadId: string;
  sheetRow: number;
  ranges: PlannedRange[];
};

export type PlannedAppend = {
  leadId: string;
  sheetRow: number;
  values: string[];
};

export function resultCells(lead: DirtyLead, appUrl: string | undefined, updatedAt: string) {
  const values: Record<ResultHeader, string> = {
    Status: sanitizeSheetCell(lead.status),
    Interest: sanitizeSheetCell(lead.interest ?? ""),
    "Callback time": sanitizeSheetCell(lead.callbackAt ?? ""),
    Attempts: sanitizeSheetCell(String(lead.attempts)),
    "Last call": sanitizeSheetCell(lead.lastCallAt ?? ""),
    Summary: sanitizeSheetCell(lead.summary ?? ""),
    Notes: sanitizeSheetCell(lead.notes ?? ""),
    "Call link": sanitizeSheetCell(callLink(appUrl, lead.callId)),
    "Updated at": sanitizeSheetCell(updatedAt),
  };
  return values;
}

function rangesForResult(tab: string, row: number, layout: HeaderPlan, values: Record<ResultHeader, string>) {
  const indexes = RESULT_HEADERS.map((header) => layout.resultIndexes[header]).filter((index) => index >= 0);
  return contiguousRuns(indexes).map((run) => {
    const start = run[0] ?? 0;
    const end = run[run.length - 1] ?? start;
    const cells: string[] = [];
    for (let column = start; column <= end; column += 1) {
      const header = RESULT_HEADERS.find((name) => layout.resultIndexes[name] === column);
      cells.push(header ? values[header] : "");
    }
    const range =
      start === end
        ? `${quoteTab(tab)}!${columnLetter(start)}${row}`
        : `${quoteTab(tab)}!${columnLetter(start)}${row}:${columnLetter(end)}${row}`;
    return { range, values: [cells] };
  });
}

export function planSheetWrite(input: {
  tab: string;
  layout: HeaderPlan;
  rows: SheetGridRow[];
  leads: DirtyLead[];
  appUrl?: string;
  updatedAt: string;
}) {
  const phoneToRow = new Map<string, number>();
  if (input.layout.phoneIndex >= 0) {
    for (const row of input.rows) {
      const parsed = normalizePhone(row.cells[input.layout.phoneIndex] ?? "");
      if (parsed.ok && !phoneToRow.has(parsed.e164)) phoneToRow.set(parsed.e164, row.sheetRow);
    }
  }

  const lastRow = input.rows.reduce((max, row) => Math.max(max, row.sheetRow), 1);
  let nextRow = lastRow + 1;
  const updates: PlannedUpdate[] = [];
  const appends: PlannedAppend[] = [];

  for (const lead of input.leads) {
    const matched = lead.sheetRow != null && lead.sheetRow >= 2 ? lead.sheetRow : (phoneToRow.get(lead.phone) ?? null);
    const values = resultCells(lead, input.appUrl, input.updatedAt);
    if (matched) {
      updates.push({
        leadId: lead.id,
        sheetRow: matched,
        ranges: rangesForResult(input.tab, matched, input.layout, values),
      });
      continue;
    }
    const rowValues = Array.from({ length: input.layout.headers.length }, () => "");
    if (input.layout.nameIndex >= 0) rowValues[input.layout.nameIndex] = sanitizeSheetCell(lead.name ?? "");
    if (input.layout.phoneIndex >= 0) rowValues[input.layout.phoneIndex] = sanitizeSheetCell(lead.phone);
    for (const header of RESULT_HEADERS) {
      const index = input.layout.resultIndexes[header];
      if (index >= 0) rowValues[index] = values[header];
    }
    appends.push({ leadId: lead.id, sheetRow: nextRow, values: rowValues });
    if (input.layout.phoneIndex >= 0) phoneToRow.set(lead.phone, nextRow);
    nextRow += 1;
  }

  return { updates, appends };
}
