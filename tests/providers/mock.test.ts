import { afterEach, describe, expect, it, vi } from "vitest";

import { MockProvider, mockCallCostUsd, mockResultDelayMs, resetMockCalls } from "@/lib/providers/mock";

const input = {
  to: "+971501234567",
  assistantId: "asst_123",
  phoneNumberId: "ph_123",
  variables: { agent_name: "Sara", business_name: "Bright Tuition" },
};

afterEach(() => {
  resetMockCalls();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MockProvider", () => {
  it("does not call the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MockProvider();
    const started = await provider.startCall(input);
    expect(started.providerCallId.startsWith("mock_")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays in progress, then returns one stable simulated result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    const provider = new MockProvider();
    const { providerCallId } = await provider.startCall({ ...input, customerName: "Aisha" });
    const early = await provider.getCall(providerCallId);
    expect(early.status).toBe("in_progress");

    vi.setSystemTime(new Date(Date.now() + mockResultDelayMs));
    const done = await provider.getCall(providerCallId);
    const again = await provider.getCall(providerCallId);

    expect(done).toMatchObject({
      status: "ended",
      outcome: "interested",
      summary: "The customer asked about class times and sounded interested.",
      structuredData: { interested: true, interest_level: "high" },
      durationSeconds: 42,
      costUsd: mockCallCostUsd,
      costIsMock: true,
    });
    expect(again).toEqual(done);
  });

  it("can simulate each outcome", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    const outcomes = ["interested", "not_interested", "no_answer", "voicemail"];

    for (const [index, outcome] of outcomes.entries()) {
      vi.spyOn(Math, "random").mockReturnValue(index / outcomes.length);
      const provider = new MockProvider();
      const { providerCallId } = await provider.startCall(input);
      vi.setSystemTime(new Date(Date.now() + mockResultDelayMs));
      const done = await provider.getCall(providerCallId);
      expect(done.outcome).toBe(outcome);
      expect(done.summary?.length).toBeGreaterThan(0);
      expect(done.structuredData).toBeTruthy();
      vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    }
  });

  it("refuses a live provider id and leaves webhook parsing for later", async () => {
    const provider = new MockProvider();
    await expect(provider.getCall("call_live_1")).rejects.toThrow(/VOICE_PROVIDER_MODE=live/);
    expect(provider.parseWebhook({ type: "end-of-call-report" })).toEqual({
      ok: false,
      reason: "not_implemented",
    });
  });
});
