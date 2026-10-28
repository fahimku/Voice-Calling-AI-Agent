import { z } from "zod";

import type { CallResultInput } from "@/lib/calls/applyCallResult";
import { mapEndedReason } from "@/lib/calls/ended-reason";
import { redactPayload } from "@/lib/calls/redact";
import { extractStructuredFields } from "@/lib/calls/structured-output";

const envelope = z.object({
  message: z
    .object({
      type: z.string().min(1),
    })
    .catchall(z.unknown()),
});

export type EndOfCallReport = {
  providerCallId: string | null;
  result: CallResultInput;
  recordingRef: string | null;
};

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function durationSeconds(message: Record<string, unknown>, call: Record<string, unknown> | null) {
  const direct = message.durationSeconds ?? call?.durationSeconds;
  if (typeof direct === "number" && direct >= 0) return Math.round(direct);
  const started = Date.parse(String(call?.startedAt ?? ""));
  const ended = Date.parse(String(call?.endedAt ?? message.endedAt ?? ""));
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return null;
  return Math.round((ended - started) / 1000);
}

function transcriptFrom(message: Record<string, unknown>, call: Record<string, unknown> | null) {
  const artifact = objectValue(message.artifact) ?? objectValue(call?.artifact);
  const direct = textValue(artifact?.transcript, 20000);
  if (direct) return direct;
  const messages = artifact?.messages;
  if (!Array.isArray(messages)) return null;
  const lines = messages.slice(0, 200).flatMap((entry) => {
    const row = objectValue(entry);
    const text = textValue(row?.message ?? row?.content, 2000);
    if (!text) return [];
    const role = row?.role === "user" || row?.role === "customer" ? "Customer" : "Assistant";
    return [`${role}: ${text}`];
  });
  return lines.length > 0 ? lines.join("\n").slice(0, 20000) : null;
}

function hasRecording(message: Record<string, unknown>, call: Record<string, unknown> | null) {
  const artifact = objectValue(message.artifact) ?? objectValue(call?.artifact);
  return Boolean(artifact && ("recording" in artifact || "recordingUrl" in artifact));
}

export function parseWebhookEnvelope(payload: unknown) {
  const parsed = envelope.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.message;
}

export function readEndOfCallReport(payload: unknown): EndOfCallReport | null {
  const message = objectValue(parseWebhookEnvelope(payload));
  if (!message || message.type !== "end-of-call-report") return null;
  const call = objectValue(message.call);
  const providerCallId = textValue(call?.id, 200);
  const endedReason = textValue(message.endedReason, 200) ?? textValue(call?.endedReason, 200);
  const fields = extractStructuredFields(payload);
  const analysis = objectValue(message.analysis) ?? objectValue(call?.analysis);
  const summary = textValue(analysis?.summary, 4000) ?? fields.notes;
  const endedAt = textValue(call?.endedAt, 80) ?? textValue(message.endedAt, 80);

  return {
    providerCallId,
    recordingRef: providerCallId && hasRecording(message, call) ? `vapi:${providerCallId}` : null,
    result: {
      endedReason,
      durationSeconds: durationSeconds(message, call),
      summary,
      transcript: transcriptFrom(message, call),
      structuredData: fields,
      outcome: mapEndedReason(endedReason),
      endedAt,
      recordingRef: providerCallId && hasRecording(message, call) ? `vapi:${providerCallId}` : null,
      rawPayload: redactPayload(payload),
    },
  };
}
