import { describe, expect, it } from "vitest";

import { maskPhone, normalizePhone } from "@/lib/phone/normalize";

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
});

describe("maskPhone", () => {
  it("masks the middle of a UAE number", () => {
    expect(maskPhone("+971501234567")).toBe("+971 50 *** 4567");
  });
});
