export const SAMPLE_LEADS_CSV = "Name,Phone\n";

export function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [headers, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
}
