import { readFileSync } from "node:fs";

import { DateTime } from "luxon";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planCallResult } from "@/lib/calls/applyCallResult";
import { MockProvider, resetMockCalls } from "@/lib/providers/mock";
import { computeBatchSize, countUsedToday, effectiveUsage } from "@/lib/scheduler/batch";
import { explainScheduler } from "@/lib/scheduler/explain";
import { runTick, type EngineState } from "@/lib/scheduler/engine";
import { claimCandidates, isLeadEligible, nextRetryAt, type SchedulerLead } from "@/lib/scheduler/leads";
import { resetTickSlot, secretsMatch, takeTickSlot } from "@/lib/scheduler/secret";
import { isCampaignOpen, localDayBounds } from "@/lib/scheduler/window";

const dubai = {
  timezone: "Asia/Dubai",
  activeDays: [1, 2, 3, 4, 5],
  windowStart: "09:00:00",
  windowEnd: "18:00:00",
};

const tuesdayNoon = DateTime.fromISO("2026-10-27T08:00:00.000Z");

function lead(partial: Partial<SchedulerLead> & Pick<SchedulerLead, "id">): SchedulerLead {
  return {
    phone: `+97150123456${partial.id}`,
    name: "Amina",
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    callbackAt: null,
    createdAt: `2026-10-01T00:00:0${partial.id}.000Z`,
    ...partial,
  };
}

function state(leads: SchedulerLead[], extra?: Partial<EngineState["campaign"]>): EngineState {
  return {
    campaign: {
      id: "camp-1",
      status: "active",
      ...dubai,
      dailyLimit: 3,
      maxConcurrent: 2,
      maxAttempts: 3,
      retryDelayMinutes: 120,
      countRetriesInLimit: true,
      ...extra,
    },
    leads,
    calls: [],
    dnc: [],
  };
}

afterEach(() => {
  resetMockCalls();
  resetTickSlot();
  vi.useRealTimers();
});

describe("call window", () => {
  it("stays closed outside the window and on a non-active day", () => {
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-27T04:00:00.000Z"))).toBe(false);
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-25T08:00:00.000Z"))).toBe(false);
    expect(
      explainScheduler({ ...dubai, status: "active" }, DateTime.fromISO("2026-10-27T04:00:00.000Z"), {
        usedToday: 0,
        dailyLimit: 3,
        inProgress: 0,
        maxConcurrent: 2,
        eligible: 1,
      }),
    ).toBe("Outside call window (opens 09:00 Asia/Dubai)");
  });

  it("treats the window start as inclusive and the end as exclusive", () => {
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-27T05:00:00.000Z"))).toBe(true);
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-27T04:59:59.000Z"))).toBe(false);
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-27T13:59:59.000Z"))).toBe(true);
    expect(isCampaignOpen(dubai, DateTime.fromISO("2026-10-27T14:00:00.000Z"))).toBe(false);
  });

  it("resets the daily limit at local midnight and stays generic across DST", () => {
    const bounds = localDayBounds(DateTime.fromISO("2026-10-27T22:00:00.000Z"), "Asia/Dubai");
    expect(bounds?.startUtc.toISO()).toBe("2026-10-27T20:00:00.000Z");
    expect(bounds?.endUtc.toISO()).toBe("2026-10-28T20:00:00.000Z");

    const calls = [
      { startedAt: "2026-10-27T19:00:00.000Z", isTest: false, attemptNumber: 1 },
      { startedAt: "2026-10-27T20:30:00.000Z", isTest: false, attemptNumber: 1 },
      { startedAt: "2026-10-27T21:00:00.000Z", isTest: true, attemptNumber: 1 },
    ];
    const afterMidnight = DateTime.fromISO("2026-10-27T20:30:00.000Z");
    expect(countUsedToday(calls, afterMidnight, "Asia/Dubai", true)).toBe(1);

    const spring = localDayBounds(DateTime.fromISO("2026-03-08T16:00:00.000Z"), "America/New_York");
    expect(spring).not.toBeNull();
    expect((spring?.endUtc.toMillis() ?? 0) - (spring?.startUtc.toMillis() ?? 0)).toBe(23 * 60 * 60 * 1000);
  });
});

describe("batch size and usage", () => {
  it("caps the batch by the remaining limit and free lines", () => {
    expect(computeBatchSize({ dailyLimit: 3, usedToday: 3, maxConcurrent: 2, inProgress: 0 })).toBe(0);
    expect(computeBatchSize({ dailyLimit: 10, usedToday: 1, maxConcurrent: 2, inProgress: 2 })).toBe(0);
    expect(computeBatchSize({ dailyLimit: 10, usedToday: 8, maxConcurrent: 5, inProgress: 1 })).toBe(2);
    expect(computeBatchSize({ dailyLimit: 3, usedToday: 4, maxConcurrent: 2, inProgress: 0 })).toBe(0);
  });

  it("counts retries only when the campaign says so", () => {
    const calls = [
      { startedAt: "2026-10-27T08:00:00.000Z", isTest: false, attemptNumber: 1 },
      { startedAt: "2026-10-27T08:10:00.000Z", isTest: false, attemptNumber: 2 },
      { startedAt: "2026-10-27T08:20:00.000Z", isTest: true, attemptNumber: 1 },
    ];
    expect(countUsedToday(calls, tuesdayNoon, "Asia/Dubai", true)).toBe(2);
    expect(countUsedToday(calls, tuesdayNoon, "Asia/Dubai", false)).toBe(1);
    expect(
      effectiveUsage({
        recordedUsed: 1,
        unrecordedFirstAttempts: 1,
        unrecordedRetries: 2,
        countRetriesInLimit: false,
      }),
    ).toBe(2);
    expect(
      effectiveUsage({
        recordedUsed: 1,
        unrecordedFirstAttempts: 1,
        unrecordedRetries: 2,
        countRetriesInLimit: true,
      }),
    ).toBe(4);
  });
});

describe("lead eligibility", () => {
  const campaign = { maxAttempts: 3 };

  it("retries only while attempts remain and the delay has passed", () => {
    const due = lead({
      id: "1",
      status: "no_answer",
      attempts: 2,
      nextAttemptAt: "2026-10-27T07:00:00.000Z",
    });
    const waiting = { ...due, nextAttemptAt: "2026-10-27T09:00:00.000Z" };
    const exhausted = { ...due, attempts: 3 };
    expect(isLeadEligible(due, campaign, tuesdayNoon)).toBe(true);
    expect(isLeadEligible(waiting, campaign, tuesdayNoon)).toBe(false);
    expect(isLeadEligible(exhausted, campaign, tuesdayNoon)).toBe(false);
    expect(nextRetryAt(tuesdayNoon, 30).toUTC().toISO()).toBe("2026-10-27T08:30:00.000Z");
  });

  it("calls a callback only when it is due, and skips DNC numbers", () => {
    const callback = lead({ id: "2", status: "callback", callbackAt: "2026-10-27T08:00:00.000Z" });
    const later = { ...callback, callbackAt: "2026-10-27T09:00:00.000Z" };
    expect(isLeadEligible(callback, campaign, tuesdayNoon)).toBe(true);
    expect(isLeadEligible(later, campaign, tuesdayNoon)).toBe(false);
    expect(isLeadEligible(lead({ id: "3" }), campaign, tuesdayNoon, new Set([lead({ id: "3" }).phone]))).toBe(false);
  });

  it("does not claim the same lead twice when ticks overlap", () => {
    const leads = ["1", "2", "3", "4", "5"].map((id) => lead({ id }));
    const input = { batchSize: 2, dnc: new Set<string>(), now: tuesdayNoon, maxAttempts: 3 };
    const first = claimCandidates(leads, { ...input, lockedIds: new Set() });
    const second = claimCandidates(leads, { ...input, lockedIds: new Set(first.map((item) => item.id)) });
    expect(first.map((item) => item.id)).toEqual(["1", "2"]);
    expect(second.map((item) => item.id)).toEqual(["3", "4"]);
    expect(first.some((item) => second.some((other) => other.id === item.id))).toBe(false);
  });

  it("orders callbacks ahead of retries and pending leads", () => {
    const leads = [
      lead({ id: "1", createdAt: "2026-10-01T00:00:01.000Z" }),
      lead({ id: "2", status: "failed", attempts: 1, nextAttemptAt: "2026-10-27T07:00:00.000Z" }),
      lead({ id: "3", status: "callback", callbackAt: "2026-10-27T07:00:00.000Z" }),
    ];
    const claimed = claimCandidates(leads, {
      lockedIds: new Set(),
      batchSize: 3,
      dnc: new Set(),
      now: tuesdayNoon,
      maxAttempts: 3,
    });
    expect(claimed.map((item) => item.id)).toEqual(["3", "2", "1"]);
  });
});

describe("claim SQL", () => {
  it("locks the campaign before counting usage or locking lead rows", () => {
    const sql = readFileSync("supabase/migrations/20261028010000_scheduler_claim_leads.sql", "utf8");
    const lock = sql.indexOf("perform pg_advisory_xact_lock");
    const usage = sql.indexOf("v_used := public.campaign_calls_used_today");
    const rows = sql.toLowerCase().indexOf("for update skip locked");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(usage);
    expect(usage).toBeLessThan(rows);
    expect(sql).toContain("is_test = false");
    expect(sql).toContain("attempt_number = 1");
    expect(sql).toContain("dnc_numbers");
    expect(sql).toContain("attempts = leads.attempts + 1");
  });
});

describe("tick engine", () => {
  it("starts exactly three calls for five leads and never a fourth that day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T08:00:00.000Z"));
    const provider = new MockProvider();
    let current = state(["1", "2", "3", "4", "5"].map((id) => lead({ id })));

    const tick = async () => {
      const result = await runTick(current, {
        now: DateTime.fromMillis(Date.now()),
        mode: "mock",
        startCall: (item) =>
          provider.startCall({
            to: item.phone,
            assistantId: "asst",
            phoneNumberId: "",
            customerName: item.name ?? undefined,
            variables: { customer_name: item.name ?? "" },
          }),
        getCall: (id) => provider.getCall(id),
      });
      current = result.state;
      return result.result;
    };

    const first = await tick();
    expect(first.started).toBe(2);
    vi.setSystemTime(new Date("2026-10-27T08:01:05.000Z"));
    const second = await tick();
    expect(second.started).toBe(1);
    vi.setSystemTime(new Date("2026-10-27T08:02:10.000Z"));
    const third = await tick();
    expect(third.started).toBe(0);
    expect(third.skippedReason).toBe("Daily limit reached");
    expect(current.calls).toHaveLength(3);
    expect(current.calls.every((call) => call.status === "ended")).toBe(true);
    expect(current.leads.filter((item) => item.status === "pending")).toHaveLength(2);
  });

  it("retries a no-answer lead only after the delay", async () => {
    const now = tuesdayNoon;
    let current = state([lead({ id: "1" })], { retryDelayMinutes: 30, dailyLimit: 5, maxConcurrent: 1 });
    const noAnswer = {
      status: "ended",
      outcome: "no_answer",
      endedReason: "customer-did-not-answer",
      structuredData: { interested: false },
    };

    const first = await runTick(current, {
      now,
      mode: "mock",
      startCall: async () => ({ providerCallId: "mock_1" }),
      getCall: async () => noAnswer,
    });
    current = first.state;
    const finished = await runTick(current, {
      now: now.plus({ seconds: 61 }),
      mode: "mock",
      startCall: async () => ({ providerCallId: "mock_2" }),
      getCall: async () => noAnswer,
    });
    current = finished.state;
    expect(current.leads[0]?.status).toBe("no_answer");
    expect(finished.result.started).toBe(0);

    const tooSoon = await runTick(current, {
      now: now.plus({ minutes: 29, seconds: 61 }),
      mode: "mock",
      startCall: async () => ({ providerCallId: "mock_3" }),
      getCall: async () => noAnswer,
    });
    expect(tooSoon.result.started).toBe(0);

    const retry = await runTick(tooSoon.state, {
      now: now.plus({ minutes: 32 }),
      mode: "mock",
      startCall: async () => ({ providerCallId: "mock_4" }),
      getCall: async () => noAnswer,
    });
    expect(retry.result.started).toBe(1);
    expect(retry.state.leads[0]?.attempts).toBe(2);
  });

  it("places a due callback and skips a DNC number", async () => {
    const current = state([
      lead({ id: "1", status: "callback", callbackAt: "2026-10-27T09:00:00.000Z" }),
      lead({ id: "2" }),
    ]);
    current.dnc = [lead({ id: "2" }).phone];
    const early = await runTick(current, {
      now: tuesdayNoon,
      mode: "mock",
      startCall: async () => ({ providerCallId: "mock_cb" }),
      getCall: async () => ({ status: "in_progress" }),
    });
    expect(early.result.started).toBe(0);

    const due = await runTick(current, {
      now: tuesdayNoon.plus({ hours: 2 }),
      mode: "mock",
      startCall: async (item) => ({ providerCallId: `mock_${item.id}` }),
      getCall: async () => ({ status: "in_progress" }),
    });
    expect(due.result.started).toBe(1);
    expect(due.state.leads.find((item) => item.id === "1")?.status).toBe("calling");
    expect(due.state.leads.find((item) => item.id === "2")?.status).toBe("pending");
  });

  it("ends a call that stays in progress for 15 minutes", async () => {
    const started = tuesdayNoon.minus({ minutes: 16 });
    const current = state([lead({ id: "1", status: "calling", attempts: 1 })]);
    current.calls.push({
      id: "call-1",
      leadId: "1",
      providerCallId: "live_1",
      status: "in_progress",
      isTest: false,
      attemptNumber: 1,
      startedAt: started.toUTC().toISO() ?? "",
      endedReason: null,
      outcome: null,
    });
    const result = await runTick(current, {
      now: tuesdayNoon,
      mode: "live",
      startCall: async () => {
        throw new Error("should not start");
      },
      getCall: async () => ({ status: "in_progress" }),
    });
    expect(result.state.calls[0]?.endedReason).toBe("timeout");
    expect(result.state.calls[0]?.status).toBe("ended");
    expect(result.state.leads[0]?.status).toBe("failed");
    expect(result.state.leads[0]?.nextAttemptAt).toBeTruthy();
  });

  it("polls a live call after five minutes and waits if it is still running", async () => {
    const started = tuesdayNoon.minus({ minutes: 6 });
    const current = state([lead({ id: "1", status: "calling", attempts: 1 })]);
    current.calls.push({
      id: "call-1",
      leadId: "1",
      providerCallId: "live_1",
      status: "in_progress",
      isTest: false,
      attemptNumber: 1,
      startedAt: started.toUTC().toISO() ?? "",
      endedReason: null,
      outcome: null,
    });
    const running = await runTick(structuredClone(current), {
      now: tuesdayNoon,
      mode: "live",
      startCall: async () => ({ providerCallId: "unused" }),
      getCall: async () => ({ status: "in_progress" }),
    });
    expect(running.state.calls[0]?.status).toBe("in_progress");

    const finished = await runTick(current, {
      now: tuesdayNoon,
      mode: "live",
      startCall: async () => ({ providerCallId: "unused" }),
      getCall: async () => ({
        status: "ended",
        outcome: "interested",
        endedReason: "customer-ended-call",
        structuredData: { interested: true, interest_level: "high" },
      }),
    });
    expect(finished.state.calls[0]?.outcome).toBe("interested");
    expect(finished.state.leads[0]?.status).toBe("interested");
  });
});

describe("call results", () => {
  const base = {
    callStatus: "in_progress",
    lead: { attempts: 1, phone: "+971501234567" },
    maxAttempts: 3,
    retryDelayMinutes: 120,
    now: tuesdayNoon,
  };

  it("does nothing when the call already ended", () => {
    expect(planCallResult({ ...base, callStatus: "ended", result: { outcome: "interested" } }).applied).toBe(false);
  });

  it("maps every outcome onto the lead", () => {
    const noAnswer = planCallResult({
      ...base,
      result: { endedReason: "customer-did-not-answer", outcome: "no_answer", structuredData: { interested: false } },
    });
    expect(noAnswer.lead?.status).toBe("no_answer");
    expect(noAnswer.lead?.nextAttemptAt).toBe("2026-10-27T10:00:00.000Z");

    const busy = planCallResult({ ...base, result: { endedReason: "customer-busy" } });
    expect(busy.call?.outcome).toBe("no_answer");

    const finalAttempt = planCallResult({
      ...base,
      lead: { attempts: 3, phone: "+971501234567" },
      result: { outcome: "voicemail", endedReason: "voicemail", structuredData: { interested: false } },
    });
    expect(finalAttempt.lead?.status).toBe("voicemail");
    expect(finalAttempt.lead?.nextAttemptAt).toBeNull();

    const interested = planCallResult({
      ...base,
      result: {
        outcome: "interested",
        structuredData: { interested: true, interest_level: "high", recordingUrl: "https://secret.example/a" },
      },
    });
    expect(interested.lead).toMatchObject({ status: "interested", interestLevel: "high" });
    expect(interested.call?.structuredData).not.toHaveProperty("recordingUrl");

    const callback = planCallResult({
      ...base,
      result: {
        structuredData: { callback_requested: true, callback_time: "2026-10-28T10:00:00+04:00" },
      },
    });
    expect(callback.lead?.status).toBe("callback");
    expect(callback.lead?.callbackAt).toBe("2026-10-28T06:00:00.000Z");

    const fallback = planCallResult({
      ...base,
      result: { outcome: "callback", structuredData: { callback_requested: true, callback_time: "tomorrow" } },
    });
    expect(fallback.lead?.callbackAt).toBe("2026-10-28T08:00:00.000Z");

    const dnc = planCallResult({
      ...base,
      result: { structuredData: { do_not_call: true } },
    });
    expect(dnc.lead?.status).toBe("do_not_call");
    expect(dnc.dncPhone).toBe("+971501234567");

    const notInterested = planCallResult({
      ...base,
      result: { outcome: "not_interested", structuredData: { interested: false } },
    });
    expect(notInterested.lead?.status).toBe("not_interested");

    const failed = planCallResult({ ...base, result: { endedReason: "timeout", outcome: "failed" } });
    expect(failed.lead?.status).toBe("failed");
    expect(failed.lead?.nextAttemptAt).toBe("2026-10-27T10:00:00.000Z");
  });
});

describe("tick secret", () => {
  it("compares secrets without accepting a different length and rate-limits repeats", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("ab", "abc")).toBe(false);
    expect(takeTickSlot(10_000)).toBe(true);
    expect(takeTickSlot(12_000)).toBe(false);
    expect(takeTickSlot(16_000)).toBe(true);
  });
});
