import { describe, expect, it } from "vitest";

import {
  testCallHourlyLimit,
  testCallLimitMessage,
  testCallWindowMs,
} from "@/lib/calls/test-call-limit";

describe("test call rate limit", () => {
  it("allows fewer than 5 calls in the rolling hour", () => {
    expect(testCallHourlyLimit).toBe(5);
    expect(testCallWindowMs).toBe(60 * 60 * 1000);
    expect(testCallLimitMessage(0)).toBeNull();
    expect(testCallLimitMessage(4)).toBeNull();
  });

  it("blocks the 6th test call", () => {
    expect(testCallLimitMessage(5)).toMatch(/5 test calls per hour/);
    expect(testCallLimitMessage(8)).toMatch(/Try again later/);
  });
});
