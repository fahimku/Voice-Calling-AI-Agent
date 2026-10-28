import { DateTime } from "luxon";

export const CELL_LIMIT = 2000;

const formulaStart = /^[=+\-@\t\r]/;
const recordingUrl = /https?:\/\/\S*(?:recording|vapi\.ai|storage\.googleapis\.com\/vapi)\S*/gi;
const callIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeSheetCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const stripped = raw.replace(recordingUrl, "");
  const truncated = stripped.slice(0, CELL_LIMIT);
  if (formulaStart.test(truncated)) return `'${truncated}`;
  return truncated;
}

export function sheetDateTime(value: string | null) {
  if (!value) return "";
  const date = DateTime.fromISO(value, { zone: "utc" }).setZone("Asia/Dubai");
  if (!date.isValid) return "";
  return date.toFormat("d LLL yyyy, HH:mm");
}

export function callLink(appUrl: string | undefined, callId: string | null) {
  if (!appUrl || !callId || !callIdPattern.test(callId)) return "";
  const base = appUrl.replace(/\/+$/, "");
  if (/recording/i.test(base)) return "";
  return `${base}/calls/${callId}`;
}
