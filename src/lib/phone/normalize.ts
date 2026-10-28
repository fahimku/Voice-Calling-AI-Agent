import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const defaultPhoneRegion: CountryCode = "AE";

export type PhoneRejectReason = "empty" | "invalid";

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneRejectReason };

const looseSeparators = /[\s()./-]/g;

export function expandScientificNotation(value: string) {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) return null;
  const negative = match[1] === "-";
  let digits = `${match[2]}${match[3] ?? ""}`;
  const exponent = Number(match[4]) - (match[3]?.length ?? 0);
  if (!Number.isFinite(exponent) || exponent > 30 || exponent < 0) return null;
  digits += "0".repeat(exponent);
  digits = digits.replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits}`;
}

export function sheetCellText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isSafeInteger(value)) return String(value);
    return expandScientificNotation(String(value)) ?? String(value);
  }
  return value == null ? "" : String(value);
}

function preparePhoneInput(input: string) {
  let trimmed = input.trim();
  if (trimmed.startsWith("'")) trimmed = trimmed.slice(1).trim();
  const expanded = expandScientificNotation(trimmed.replace(/,/g, ""));
  if (expanded) trimmed = expanded;
  else trimmed = trimmed.replace(/,/g, "");
  if (/^\d+\.0+$/.test(trimmed)) trimmed = trimmed.replace(/\.0+$/, "");
  return trimmed;
}

export function normalizePhone(input: string, region: CountryCode = defaultPhoneRegion): PhoneResult {
  const trimmed = preparePhoneInput(input);
  if (!trimmed) return { ok: false, reason: "empty" };

  if (/[a-z]/i.test(trimmed)) return { ok: false, reason: "invalid" };

  const compact = trimmed.replace(looseSeparators, "");
  if (!/^\+?\d+$/.test(compact)) return { ok: false, reason: "invalid" };

  const parsed = parsePhoneNumberFromString(compact.startsWith("+") ? compact : trimmed, region);
  if (parsed?.isValid()) return { ok: true, e164: parsed.number };

  if (!compact.startsWith("+")) {
    const international = parsePhoneNumberFromString(`+${compact}`);
    if (international?.isValid() && compact.startsWith(international.countryCallingCode)) {
      return { ok: true, e164: international.number };
    }
  }

  return { ok: false, reason: "invalid" };
}

export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return "••••";

  const national = String(parsed.nationalNumber);
  if (national.length < 6) return `+${parsed.countryCallingCode} •••`;

  const head = national.slice(0, 2);
  const tail = national.slice(-4);
  return `+${parsed.countryCallingCode} ${head} *** ${tail}`;
}
