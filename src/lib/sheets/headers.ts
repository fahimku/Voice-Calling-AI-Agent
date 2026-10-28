export const RESULT_HEADERS = [
  "Status",
  "Interest",
  "Callback time",
  "Attempts",
  "Last call",
  "Summary",
  "Notes",
  "Call link",
  "Updated at",
] as const;

export type ResultHeader = (typeof RESULT_HEADERS)[number];

export const DEFAULT_HEADERS = ["Name", "Phone", ...RESULT_HEADERS];

export function headerKey(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findHeaderIndex(headers: string[], names: string[]) {
  const wanted = new Set(names.map((name) => headerKey(name)));
  return headers.findIndex((header) => wanted.has(headerKey(header)));
}

export type HeaderPlan = {
  headers: string[];
  changed: boolean;
  nameIndex: number;
  phoneIndex: number;
  resultIndexes: Record<ResultHeader, number>;
};

export function planHeaders(existing: string[]): HeaderPlan {
  const trimmed = existing.map((header) => header.trim());
  const blank = trimmed.every((header) => header === "");
  const headers = blank ? [...DEFAULT_HEADERS] : [...trimmed];
  if (!blank) {
    for (const header of RESULT_HEADERS) {
      if (findHeaderIndex(headers, [header]) === -1) headers.push(header);
    }
  }
  const resultIndexes = Object.fromEntries(
    RESULT_HEADERS.map((header) => [header, findHeaderIndex(headers, [header])]),
  ) as Record<ResultHeader, number>;
  const changed =
    blank || headers.length !== trimmed.length || headers.some((header, index) => header !== trimmed[index]);
  return {
    headers,
    changed,
    nameIndex: findHeaderIndex(headers, ["name"]),
    phoneIndex: findHeaderIndex(headers, ["phone", "phone number"]),
    resultIndexes,
  };
}

export function columnLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function quoteTab(tab: string) {
  return `'${tab.replace(/'/g, "''")}'`;
}

export function contiguousRuns(indexes: number[]) {
  const sorted = [...new Set(indexes)].filter((index) => index >= 0).sort((left, right) => left - right);
  const runs: number[][] = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else runs.push([index]);
  }
  return runs;
}
