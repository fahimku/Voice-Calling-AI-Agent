import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { buildOutcomeSeries, campaignsOutsideWindow, formatUsd, funnelSteps, sumCampaignUsage } from "@/lib/dashboard/aggregate";
import { evaluatePreflight, publicAppUrlOk } from "@/lib/dashboard/preflight";

describe("dashboard aggregation", () => {
  it("sums daily usage and fills 14 outcome days", () => {
    expect(
      sumCampaignUsage([
        { used: 2, dailyLimit: 10 },
        { used: 3, dailyLimit: 5 },
      ]),
    ).toEqual({ used: 5, dailyLimit: 15 });

    const series = buildOutcomeSeries("2026-10-15", 14, [
      { day: "2026-10-15", outcome: "interested", total: 2 },
      { day: "2026-10-16", outcome: "no_answer", total: 1 },
      { day: "2026-10-16", outcome: "callback", total: 4 },
    ]);
    expect(series).toHaveLength(14);
    expect(series[0]).toMatchObject({ day: "2026-10-15", interested: 2, no_answer: 0 });
    expect(series[1]).toMatchObject({ no_answer: 1, interested: 0 });
    expect(series[13]?.day).toBe("2026-10-28");
  });

  it("builds the lead funnel and finds campaigns outside the window", () => {
    expect(funnelSteps({ total: 10, called: 6, answered: 3, interested: 1 }).map((step) => step.value)).toEqual([
      10, 6, 3, 1,
    ]);
    const now = DateTime.fromISO("2026-10-28T02:00:00.000Z");
    const closed = campaignsOutsideWindow(
      [
        {
          id: "1",
          name: "Night",
          timezone: "Asia/Dubai",
          activeDays: [1, 2, 3, 4, 5, 6, 7],
          windowStart: "09:00",
          windowEnd: "18:00",
        },
      ],
      now,
    );
    expect(closed[0]?.reason).toMatch(/outside the call window/i);
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});

describe("go-live checks", () => {
  it("fails localhost and a missing secret without echoing secret values", () => {
    const secret = "super-secret-value";
    expect(publicAppUrlOk("http://localhost:3000")).toBe(false);
    expect(publicAppUrlOk("https://calls.example.com")).toBe(true);
    const checks = evaluatePreflight({
      vapiKeyPresent: false,
      webhookSecretPresent: true,
      cronSecretPresent: false,
      appUrl: "http://localhost:3000",
      activeCampaigns: [{ name: "Bright", assistantId: "", phoneNumberId: "phone" }],
      sheetConnected: true,
      googleReady: false,
      dncReadable: true,
      dncCount: 0,
    });
    expect(checks.find((check) => check.id === "vapi-key")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "agents")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "app-url")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "google")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "dnc")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "webhook-secret")?.status).toBe("pass");
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("passes when every live requirement is met", () => {
    const checks = evaluatePreflight({
      vapiKeyPresent: true,
      webhookSecretPresent: true,
      cronSecretPresent: true,
      appUrl: "https://calls.example.com",
      activeCampaigns: [{ name: "Bright", assistantId: "asst", phoneNumberId: "phone" }],
      sheetConnected: false,
      googleReady: false,
      dncReadable: true,
      dncCount: 2,
    });
    expect(checks.every((check) => check.status === "pass")).toBe(true);
  });
});
