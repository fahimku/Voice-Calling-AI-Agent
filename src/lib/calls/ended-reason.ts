export type EndedReasonOutcome = "no_answer" | "voicemail" | "failed" | "completed";

const noAnswer = new Set(["customer-did-not-answer", "customer-busy"]);

const completed = new Set([
  "customer-ended-call",
  "assistant-ended-call",
  "silence-timed-out",
  "exceeded-max-duration",
  "hangup",
  "customer-ended-call-before-warm-transfer",
  "customer-ended-call-after-warm-transfer-attempt",
  "customer-ended-call-during-transfer",
]);

export function mapEndedReason(reason: string | null | undefined): EndedReasonOutcome {
  const value = reason?.trim() ?? "";
  if (!value) return "failed";
  if (value === "voicemail" || value.startsWith("voicemail-")) return "voicemail";
  if (noAnswer.has(value)) return "no_answer";
  if (completed.has(value)) return "completed";
  if (/error|failed|timeout|fault|worker-died|not-found|not-valid|shutdown/i.test(value)) return "failed";
  return "failed";
}
