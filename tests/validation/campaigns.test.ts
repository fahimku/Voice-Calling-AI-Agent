import { describe, expect, it } from "vitest";

import { campaignCanStart, campaignSchema, campaignStatusChange, ownedCampaignError, sheetActionsAllowed, shouldPauseForNewLeads } from "@/lib/validation/campaigns";

const validCampaign = {
  name: "Morning outreach",
  agentId: "11111111-1111-4111-8111-111111111111",
  timezone: "Asia/Dubai",
  dailyLimit: 50,
  windowStart: "09:00",
  windowEnd: "18:00",
  activeDays: [1, 2, 3, 4, 5],
  maxConcurrent: 2,
  maxAttempts: 3,
  retryDelayMinutes: 120,
  countRetriesInLimit: true,
};

describe("campaignSchema", () => {
  it("accepts a valid campaign", () => {
    expect(campaignSchema.safeParse(validCampaign).success).toBe(true);
  });

  it("accepts form-shaped strings", () => {
    const parsed = campaignSchema.safeParse({
      ...validCampaign,
      dailyLimit: "50",
      activeDays: ["1", "2", "3", "4", "5"],
      maxConcurrent: "2",
      maxAttempts: "3",
      retryDelayMinutes: "120",
      countRetriesInLimit: "false",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.countRetriesInLimit).toBe(false);
      expect(parsed.data.dailyLimit).toBe(50);
    }
  });

  it("rejects daily limits outside 1-1000", () => {
    expect(campaignSchema.safeParse({ ...validCampaign, dailyLimit: 0 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, dailyLimit: 1001 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, dailyLimit: 1.5 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, dailyLimit: 1 }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...validCampaign, dailyLimit: 1000 }).success).toBe(true);
  });

  it("rejects concurrency, attempts, and retry delay outside their ranges", () => {
    expect(campaignSchema.safeParse({ ...validCampaign, maxConcurrent: 0 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, maxConcurrent: 11 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, maxAttempts: 0 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, maxAttempts: 6 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, retryDelayMinutes: 14 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, retryDelayMinutes: 1441 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, maxConcurrent: 10 }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...validCampaign, maxAttempts: 5 }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...validCampaign, retryDelayMinutes: 15 }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...validCampaign, retryDelayMinutes: 1440 }).success).toBe(true);
  });

  it("rejects a window that does not end later than it starts", () => {
    for (const windowEnd of ["09:00", "08:00"]) {
      const parsed = campaignSchema.safeParse({ ...validCampaign, windowEnd });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((issue) => issue.path[0] === "windowEnd")).toBe(true);
      }
    }
  });

  it("rejects an empty day list, an invalid day, and duplicate days", () => {
    expect(campaignSchema.safeParse({ ...validCampaign, activeDays: [] }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, activeDays: [0] }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, activeDays: [8] }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, activeDays: [1, 1] }).success).toBe(false);
  });

  it("rejects an unknown timezone and accepts Asia/Dubai", () => {
    expect(campaignSchema.safeParse({ ...validCampaign, timezone: "Not/AZone" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...validCampaign, timezone: "Asia/Dubai" }).success).toBe(true);
  });

  it("rejects a missing agent", () => {
    const parsed = campaignSchema.safeParse({ ...validCampaign, agentId: "not-an-id" });
    expect(parsed.success).toBe(false);
  });
});

describe("campaignCanStart", () => {
  it("allows a valid draft to start", () => {
    expect(
      campaignCanStart({
        agentId: validCampaign.agentId,
        dailyLimit: 50,
        windowStart: "09:00:00",
        windowEnd: "18:00:00",
      }),
    ).toBeNull();
  });

  it("blocks an invalid window or limit", () => {
    expect(
      campaignCanStart({
        agentId: validCampaign.agentId,
        dailyLimit: 50,
        windowStart: "18:00",
        windowEnd: "09:00",
      }),
    ).toMatch(/call window/i);
    expect(
      campaignCanStart({
        agentId: validCampaign.agentId,
        dailyLimit: 0,
        windowStart: "09:00",
        windowEnd: "18:00",
      }),
    ).toMatch(/daily limit/i);
  });
});

describe("campaign status changes", () => {
  it("reopens a completed campaign to paused and leaves other statuses alone", () => {
    expect(campaignStatusChange("reopen", "completed")).toBe("paused");
    expect(campaignStatusChange("reopen", "active")).toBeNull();
    expect(campaignStatusChange("start", "completed")).toBeNull();
    expect(shouldPauseForNewLeads("completed", 3)).toBe(true);
    expect(shouldPauseForNewLeads("completed", 0)).toBe(false);
    expect(shouldPauseForNewLeads("active", 3)).toBe(false);
  });

  it("lets sheet actions run for every status and does not call a load failure a missing campaign", () => {
    for (const status of ["draft", "active", "paused", "completed"]) {
      expect(sheetActionsAllowed(status)).toBe(true);
      expect(ownedCampaignError({ queryFailed: false, found: true })).toBeNull();
    }
    expect(ownedCampaignError({ queryFailed: true, found: true })).toBe("Could not load this campaign.");
    expect(ownedCampaignError({ queryFailed: false, found: false })).toBe("Campaign not found.");
  });
});
