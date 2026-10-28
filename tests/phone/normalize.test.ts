import { describe, expect, it } from "vitest";

import { maskPhone, normalizePhone, sheetCellText } from "@/lib/phone/normalize";

describe("normalizePhone", () => {
  it("converts a UAE local mobile number to E.164", () => {
    expect(normalizePhone("0501234567")).toEqual({ ok: true, e164: "+971501234567" });
  });

  it("keeps a number that already uses +971", () => {
    expect(normalizePhone("+971501234567")).toEqual({ ok: true, e164: "+971501234567" });
  });

  it("keeps an international number and its country", () => {
    expect(normalizePhone("+14155552671")).toEqual({ ok: true, e164: "+14155552671" });
  });

  it("accepts spaces, dashes, and brackets", () => {
    expect(normalizePhone("(050) 123-4567")).toEqual({ ok: true, e164: "+971501234567" });
    expect(normalizePhone("+971 50 123 4567")).toEqual({ ok: true, e164: "+971501234567" });
  });

  it("rejects an empty value", () => {
    expect(normalizePhone("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a number that is too short", () => {
    expect(normalizePhone("050")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects letters", () => {
    expect(normalizePhone("05012abc67")).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a sheet number that already includes a country code", () => {
    expect(normalizePhone("971501234567")).toEqual({ ok: true, e164: "+971501234567" });
    expect(normalizePhone("923001234567")).toEqual({ ok: true, e164: "+923001234567" });
    expect(normalizePhone("9.71501234567E+11")).toEqual({ ok: true, e164: "+971501234567" });
    expect(normalizePhone("971,501,234,567")).toEqual({ ok: true, e164: "+971501234567" });
  });

  it("still rejects a number that is not valid with a plus prefix", () => {
    expect(normalizePhone("12345")).toEqual({ ok: false, reason: "invalid" });
    expect(sheetCellText(971501234567)).toBe("971501234567");
  });

  it("rejects obviously fake numbers even when a leading plus would look valid", () => {
    expect(normalizePhone("12345465767")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhone("56565656565")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhone("1234546576786")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhone("+12345465767")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhone("+56565656565")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("maskPhone", () => {
  it("masks the middle of a UAE number", () => {
    expect(maskPhone("+971501234567")).toBe("+971 50 *** 4567");
  });
});
