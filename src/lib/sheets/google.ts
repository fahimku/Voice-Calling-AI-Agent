import "server-only";

import { google } from "googleapis";

import { sheetCellText } from "@/lib/phone/normalize";
import { rowFromUpdatedRange, type SheetsApi, type ValueRange } from "@/lib/sheets/api";
import { serviceAccountCredentials, type SheetRuntime } from "@/lib/sheets/env";
import { withSheetsRetry } from "@/lib/sheets/retry";

export function createSheetsApi(env: Pick<SheetRuntime, "email" | "privateKey">): SheetsApi {
  const credentials = serviceAccountCredentials(env.email, env.privateKey);
  if (!credentials.email || !credentials.key) {
    throw new Error("Google Sheets is not configured.");
  }
  const auth = new google.auth.JWT({
    email: credentials.email,
    key: credentials.key,
    scopes: credentials.scopes,
  });
  const sheets = google.sheets({ version: "v4", auth });

  return {
    async getSpreadsheet(sheetId) {
      const response = await withSheetsRetry(() =>
        sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" }),
      );
      const titles = (response.data.sheets ?? [])
        .map((sheet) => sheet.properties?.title ?? "")
        .filter((title) => title.length > 0);
      return { titles };
    },
    async getValues(sheetId, range) {
      const response = await withSheetsRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range, valueRenderOption: "UNFORMATTED_VALUE" }),
      );
      return (response.data.values ?? []).map((row) => row.map((cell) => sheetCellText(cell)));
    },
    async batchUpdate(sheetId, data: ValueRange[]) {
      if (data.length === 0) return;
      await withSheetsRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { valueInputOption: "USER_ENTERED", data },
        }),
      );
    },
    async append(sheetId, range, values) {
      const response = await withSheetsRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values },
        }),
      );
      return { startRow: rowFromUpdatedRange(response.data.updates?.updatedRange) };
    },
  };
}
