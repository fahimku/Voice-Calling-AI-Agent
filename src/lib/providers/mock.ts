import type {
  ProviderCall,
  ProviderCallOutcome,
  StartCallInput,
  VoiceProvider,
  WebhookParseResult,
} from "@/lib/providers/types";

export const mockResultDelayMs = 3000;

type MockScript = {
  outcome: ProviderCallOutcome;
  endedReason: string;
  summary: string;
  structuredData: Record<string, unknown>;
  transcript?: string;
  durationSeconds: number;
};

const scripts: MockScript[] = [
  {
    outcome: "interested",
    endedReason: "customer-ended-call",
    summary: "The customer asked about class times and sounded interested.",
    structuredData: { interested: true, interest_level: "high" },
    transcript: "Assistant: Hi, this is a test call.\nCustomer: Yes, tell me more.",
    durationSeconds: 42,
  },
  {
    outcome: "not_interested",
    endedReason: "customer-ended-call",
    summary: "The customer said they are not interested.",
    structuredData: { interested: false, interest_level: "none" },
    transcript: "Assistant: Hi, this is a test call.\nCustomer: No thanks.",
    durationSeconds: 28,
  },
  {
    outcome: "no_answer",
    endedReason: "customer-did-not-answer",
    summary: "The customer did not answer.",
    structuredData: { interested: false },
    durationSeconds: 0,
  },
  {
    outcome: "voicemail",
    endedReason: "voicemail",
    summary: "The call reached voicemail.",
    structuredData: { interested: false },
    transcript: "Assistant: Hi, this is a test call.",
    durationSeconds: 12,
  },
];

type StoredMock = {
  startedAt: number;
  script: MockScript;
};

const mockCalls = new Map<string, StoredMock>();

export function resetMockCalls() {
  mockCalls.clear();
}

function scriptForId(id: string) {
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % scripts.length;
  return scripts[index] ?? scripts[0]!;
}

function completed(script: MockScript, startedAt: number): ProviderCall {
  return {
    status: "ended",
    endedReason: script.endedReason,
    durationSeconds: script.durationSeconds,
    summary: script.summary,
    ...(script.transcript ? { transcript: script.transcript } : {}),
    structuredData: script.structuredData,
    outcome: script.outcome,
    endedAt: new Date(startedAt + script.durationSeconds * 1000).toISOString(),
  };
}

export class MockProvider implements VoiceProvider {
  async startCall(_input: StartCallInput) {
    const providerCallId = `mock_${crypto.randomUUID()}`;
    const index = Math.floor(Math.random() * scripts.length);
    mockCalls.set(providerCallId, {
      startedAt: Date.now(),
      script: scripts[index] ?? scripts[0]!,
    });
    return { providerCallId };
  }

  async getCall(providerCallId: string): Promise<ProviderCall> {
    if (!providerCallId.startsWith("mock_")) {
      throw new Error("This call was placed with Vapi. Set VOICE_PROVIDER_MODE=live to refresh it.");
    }

    const stored = mockCalls.get(providerCallId);
    const script = stored?.script ?? scriptForId(providerCallId);
    const startedAt = stored?.startedAt ?? 0;
    if (Date.now() - startedAt < mockResultDelayMs) {
      return { status: "in_progress" };
    }
    return completed(script, startedAt || Date.now());
  }

  parseWebhook(_payload: unknown): WebhookParseResult {
    return { ok: false, reason: "not_implemented" };
  }
}
