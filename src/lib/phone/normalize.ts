import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const defaultPhoneRegion: CountryCode = "AE";

export type PhoneRejectReason = "empty" | "invalid";

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneRejectReason };

const looseSeparators = /[\s()./-]/g;

export function normalizePhone(input: string, region: CountryCode = defaultPhoneRegion): PhoneResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  if (/[a-z]/i.test(trimmed)) return { ok: false, reason: "invalid" };

  const compact = trimmed.replace(looseSeparators, "");
  if (!/^\+?\d+$/.test(compact)) return { ok: false, reason: "invalid" };

  const parsed = parsePhoneNumberFromString(trimmed, region);
  if (!parsed?.isValid()) return { ok: false, reason: "invalid" };

  return { ok: true, e164: parsed.number };
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
