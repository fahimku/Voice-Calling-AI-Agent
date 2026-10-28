import { describe, expect, it } from "vitest";

import { extractCallCost } from "@/lib/calls/cost";
import { readEndOfCallReport } from "@/lib/calls/end-of-call-report";

describe("extractCallCost", () => {
  it("reads message.cost from the end-of-call report", () => {
    expect(extractCallCost({ cost: 0.15 }, { cost: 9 })).toBe(0.15);
    expect(extractCallCost({}, { cost: "0.42" })).toBe(0.42);
  });

  it("sums component costs only when the total is missing", () => {
    expect(extractCallCost({ costs: [{ cost: 0.1 }, { cost: 0.05 }] }, null)).toBe(0.15);
    expect(extractCallCost({ cost: -1 }, null)).toBeNull();
  });

  it("puts the Vapi cost on the parsed report and does not mark it as mock", () => {
    const report = readEndOfCallReport({
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        cost: 0.15,
        call: { id: "call_123", endedAt: "2026-10-28T08:00:00.000Z" },
      },
    });
    expect(report?.result.costUsd).toBe(0.15);
    expect(report?.result.costIsMock).toBe(false);
  });
});
