export type ProviderCallStatus = "queued" | "in_progress" | "ended" | "failed";

export type ProviderCallOutcome =
  | "no_answer"
  | "voicemail"
  | "interested"
  | "not_interested"
  | "callback"
  | "do_not_call"
  | "failed"
  | "completed";

export type ProviderCall = {
  status: ProviderCallStatus;
  endedReason?: string;
  durationSeconds?: number;
  summary?: string;
  transcript?: string;
  structuredData?: Record<string, unknown>;
  outcome?: ProviderCallOutcome;
  endedAt?: string;
  costUsd?: number;
  costIsMock?: boolean;
};

export type StartCallInput = {
  to: string;
  customerName?: string;
  assistantId: string;
  phoneNumberId: string;
  variables: Record<string, string>;
};

export type WebhookParseResult = { ok: false; reason: "not_implemented" };

export interface VoiceProvider {
  startCall(input: StartCallInput): Promise<{ providerCallId: string }>;
  getCall(providerCallId: string): Promise<ProviderCall>;
  parseWebhook(payload: unknown): WebhookParseResult;
}
