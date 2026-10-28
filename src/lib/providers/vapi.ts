import type {
  ProviderCall,
  ProviderCallOutcome,
  ProviderCallStatus,
  StartCallInput,
  VoiceProvider,
  WebhookParseResult,
} from "@/lib/providers/types";

export const vapiBaseUrl = "https://api.vapi.ai";

const summaryLimit = 4000;
const transcriptLimit = 20000;

export function openingLine(agentName: string, businessName: string) {
  const agent = agentName.trim() || "the assistant";
  const business = businessName.trim() || "the business";
  return `Hi, this is ${agent}, an AI assistant calling on behalf of ${business}. This call may be recorded. Do you have a quick minute?`;
}

function stringVariables(variables: Record<string, string>) {
  const copy: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "string") copy[key] = value;
  }
  return copy;
}

export function buildOutboundCallBody(input: StartCallInput) {
  const customerName = input.customerName?.trim() ?? "";
  const variableValues: Record<string, string> = {
    ...stringVariables(input.variables),
    customer_name: customerName,
  };
  const assistantOverrides: {
    variableValues: Record<string, string>;
    firstMessage?: string;
  } = { variableValues };

  if (!customerName) {
    assistantOverrides.firstMessage = openingLine(
      variableValues.agent_name ?? "",
      variableValues.business_name ?? "",
    );
  }

  const customer: { number: string; name?: string } = { number: input.to };
  if (customerName) customer.name = customerName;

  return {
    assistantId: input.assistantId,
    phoneNumberId: input.phoneNumberId,
    customer,
    assistantOverrides,
  };
}

export function vapiErrorMessage(status: number, action: "start" | "refresh") {
  if (status === 401) return "The Vapi API key was rejected. Check VAPI_API_KEY.";
  if (status === 402) return "Vapi could not place the call because the account needs credits.";
  if (status === 429) return "Vapi is rate limiting requests. Wait a moment and try again.";
  if (status === 400) {
    return action === "start"
      ? "Vapi rejected this call. Check the assistant ID, the phone number ID, and the destination number."
      : "Vapi could not refresh this call.";
  }
  return action === "start"
    ? "Vapi could not place the call. Try again."
    : "Vapi could not refresh this call. Try again.";
}

function plainObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function mapVapiStatus(status: unknown): ProviderCallStatus {
  if (status === "scheduled" || status === "queued") return "queued";
  if (status === "ringing" || status === "in-progress" || status === "forwarding") return "in_progress";
  if (status === "ended") return "ended";
  return "failed";
}

function durationFromTimestamps(startedAt: unknown, endedAt: unknown) {
  if (typeof startedAt !== "string" || typeof endedAt !== "string") return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.round((end - start) / 1000);
}

function outcomeFromCall(
  status: ProviderCallStatus,
  endedReason: string | undefined,
  structuredData: Record<string, unknown> | undefined,
): ProviderCallOutcome | undefined {
  if (status !== "ended" && status !== "failed") return undefined;
  if (structuredData?.do_not_call === true) return "do_not_call";
  if (structuredData?.interested === true) return "interested";
  if (endedReason === "voicemail") return "voicemail";
  if (endedReason === "customer-did-not-answer" || endedReason === "customer-busy") return "no_answer";
  if (structuredData?.interested === false) return "not_interested";
  if (status === "failed") return "failed";
  if (status === "ended") return "completed";
  return undefined;
}

export function mapVapiCall(payload: unknown): ProviderCall {
  const call = plainObject(payload);
  if (!call) throw new Error("Vapi returned an unexpected response.");

  const status = mapVapiStatus(call.status);
  const endedReason = typeof call.endedReason === "string" ? call.endedReason : undefined;
  const endedAt = typeof call.endedAt === "string" ? call.endedAt : undefined;
  const analysis = plainObject(call.analysis);
  const artifact = plainObject(call.artifact);
  const summary = typeof analysis?.summary === "string" ? analysis.summary.slice(0, summaryLimit) : undefined;
  const structuredData = plainObject(analysis?.structuredData);
  const transcript =
    typeof artifact?.transcript === "string" ? artifact.transcript.slice(0, transcriptLimit) : undefined;
  // Get Call has startedAt and endedAt, not a duration field.
  const durationSeconds = durationFromTimestamps(call.startedAt, call.endedAt);
  const outcome = outcomeFromCall(status, endedReason, structuredData);

  return {
    status,
    ...(endedReason ? { endedReason } : {}),
    ...(durationSeconds != null ? { durationSeconds } : {}),
    ...(summary ? { summary } : {}),
    ...(transcript ? { transcript } : {}),
    ...(structuredData ? { structuredData } : {}),
    ...(outcome ? { outcome } : {}),
    ...(endedAt ? { endedAt } : {}),
  };
}

function callId(payload: unknown) {
  const record = plainObject(payload);
  return record && typeof record.id === "string" && record.id.length > 0 ? record.id : null;
}

export class VapiProvider implements VoiceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async startCall(input: StartCallInput) {
    const response = await this.request("/call", {
      method: "POST",
      body: JSON.stringify(buildOutboundCallBody(input)),
      action: "start",
    });
    const id = callId(await readJson(response));
    if (!id) throw new Error("Vapi did not return a call id.");
    return { providerCallId: id };
  }

  async getCall(providerCallId: string) {
    if (providerCallId.startsWith("mock_")) {
      throw new Error("This test call was placed in mock mode, so there is no Vapi call to refresh.");
    }
    if (!/^[\w-]+$/.test(providerCallId)) {
      throw new Error("This call could not be refreshed.");
    }
    const response = await this.request(`/call/${encodeURIComponent(providerCallId)}`, {
      method: "GET",
      action: "refresh",
    });
    return mapVapiCall(await readJson(response));
  }

  parseWebhook(_payload: unknown): WebhookParseResult {
    return { ok: false, reason: "not_implemented" };
  }

  private async request(
    path: string,
    init: { method: "GET" | "POST"; body?: string; action: "start" | "refresh" },
  ) {
    let response: Response;
    try {
      response = await this.fetchImpl(`${vapiBaseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: init.body,
      });
    } catch {
      throw new Error("Could not reach Vapi. Try again.");
    }

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(vapiErrorMessage(response.status, init.action));
    }

    return response;
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error("Vapi returned an unexpected response.");
  }
}
