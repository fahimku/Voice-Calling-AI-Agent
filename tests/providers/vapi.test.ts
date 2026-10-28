import { describe, expect, it, vi } from "vitest";

import {
  VapiProvider,
  buildOutboundCallBody,
  mapVapiCall,
  openingLine,
  vapiErrorMessage,
} from "@/lib/providers/vapi";

const base = {
  to: "+971501234567",
  assistantId: "asst_123",
  phoneNumberId: "ph_123",
  variables: {
    services_summary: "Maths and science",
    agent_name: "Sara",
    business_name: "Bright Tuition",
  },
};

describe("buildOutboundCallBody", () => {
  it("sends the customer name and prompt variables without replacing the opening line", () => {
    const body = buildOutboundCallBody({ ...base, customerName: "Aisha" });

    expect(body).toEqual({
      assistantId: "asst_123",
      phoneNumberId: "ph_123",
      customer: { number: "+971501234567", name: "Aisha" },
      assistantOverrides: {
        variableValues: {
          services_summary: "Maths and science",
          agent_name: "Sara",
          business_name: "Bright Tuition",
          customer_name: "Aisha",
        },
      },
    });
    expect(body.assistantOverrides.firstMessage).toBeUndefined();
  });

  it("uses a disclosure opening line when the customer name is missing", () => {
    const body = buildOutboundCallBody({ ...base, customerName: "  " });

    expect(body.customer).toEqual({ number: "+971501234567" });
    expect(body.assistantOverrides.variableValues.customer_name).toBe("");
    expect(body.assistantOverrides.firstMessage).toBe(
      "Hi, this is Sara, an AI assistant calling on behalf of Bright Tuition. This call may be recorded. Do you have a quick minute?",
    );
    expect(body.assistantOverrides.firstMessage).toBe(openingLine("Sara", "Bright Tuition"));
  });

  it("keeps the opening line speakable when the agent names are blank", () => {
    const body = buildOutboundCallBody({
      ...base,
      variables: { services_summary: "Maths" },
    });

    expect(body.assistantOverrides.firstMessage).toBe(openingLine("", ""));
    expect(body.assistantOverrides.firstMessage).toContain("the assistant");
    expect(body.assistantOverrides.firstMessage).toContain("the business");
    expect(body.assistantOverrides.variableValues.customer_name).toBe("");
  });
});

describe("vapiErrorMessage", () => {
  it("maps auth, validation, credit, and rate-limit responses", () => {
    expect(vapiErrorMessage(401, "start")).toMatch(/API key/);
    expect(vapiErrorMessage(400, "start")).toMatch(/rejected this call/);
    expect(vapiErrorMessage(402, "start")).toMatch(/credits/);
    expect(vapiErrorMessage(429, "start")).toMatch(/rate limiting/);
    expect(vapiErrorMessage(500, "refresh")).toMatch(/refresh/);
  });
});

describe("VapiProvider", () => {
  it("posts the outbound call with a bearer token and returns the call id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "call_123" }, { status: 201 }));
    const provider = new VapiProvider("test-key", fetchMock);

    await expect(provider.startCall({ ...base, customerName: "Aisha" })).resolves.toEqual({
      providerCallId: "call_123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.vapi.ai/call");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      assistantId: "asst_123",
      customer: { number: "+971501234567", name: "Aisha" },
    });
  });

  it("hides provider error bodies and maps status codes", async () => {
    const cases = [
      [401, /API key/],
      [400, /rejected this call/],
      [402, /credits/],
      [429, /rate limiting/],
    ] as const;

    for (const [status, pattern] of cases) {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ message: "bad number +971501234567" }), { status }),
      );
      const provider = new VapiProvider("test-key", fetchMock);
      const error = await provider.startCall(base).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(pattern);
      expect((error as Error).message).not.toContain("+971501234567");
    }
  });

  it("maps a fetched call and ignores recording urls", async () => {
    const payload = {
      id: "call_123",
      status: "ended",
      endedReason: "customer-ended-call",
      startedAt: "2026-10-27T12:00:00.000Z",
      endedAt: "2026-10-27T12:01:05.000Z",
      analysis: {
        summary: "Asked about tuition.",
        structuredData: { interested: true, interest_level: "high" },
      },
      artifact: {
        transcript: "Assistant: Hi\nCustomer: Yes",
        recordingUrl: "https://example.invalid/secret.wav",
        presignedStereoUrl: "https://example.invalid/stereo.wav",
      },
    };
    const fetchMock = vi.fn(async () => Response.json(payload, { status: 200 }));
    const provider = new VapiProvider("test-key", fetchMock);
    const result = await provider.getCall("call_123");

    expect(result).toEqual({
      status: "ended",
      endedReason: "customer-ended-call",
      durationSeconds: 65,
      summary: "Asked about tuition.",
      transcript: "Assistant: Hi\nCustomer: Yes",
      structuredData: { interested: true, interest_level: "high" },
      outcome: "interested",
      endedAt: "2026-10-27T12:01:05.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("secret.wav");
    expect(mapVapiCall({ status: "in-progress" })).toEqual({ status: "in_progress" });
    expect(provider.parseWebhook({})).toEqual({ ok: false, reason: "not_implemented" });
  });

  it("reports a network failure without the destination number", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connect failed for +971501234567");
    });
    const provider = new VapiProvider("test-key", fetchMock);
    await expect(provider.getCall("call_123")).rejects.toThrow("Could not reach Vapi. Try again.");
  });
});
