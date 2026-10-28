import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { retryAtIso } from "@/lib/scheduler/leads";

const interestLevels = new Set(["high", "medium", "low", "none"]);

export type CallResultInput = {
  endedReason?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  structuredData?: Record<string, unknown> | null;
  outcome?: string | null;
  endedAt?: string | null;
};

export type PlannedCallResult = {
  applied: boolean;
  call: {
    status: "ended";
    endedReason: string | null;
    durationSeconds: number | null;
    summary: string | null;
    transcript: string | null;
    structuredData: Record<string, unknown> | null;
    outcome: string;
    endedAt: string;
  } | null;
  lead: {
    status: string;
    interestLevel: "high" | "medium" | "low" | "none" | null;
    callbackAt: string | null;
    nextAttemptAt: string | null;
    summary: string | null;
  } | null;
  dncPhone: string | null;
};

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function plainData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/recording|url/i.test(key)) continue;
    copy[key] = entry;
  }
  return copy;
}

function flag(data: Record<string, unknown> | null, key: string) {
  return data?.[key] === true;
}

function callbackIso(data: Record<string, unknown> | null, now: DateTime) {
  const raw = data?.callback_time ?? data?.callback_at;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = DateTime.fromISO(raw.trim(), { setZone: true });
    if (parsed.isValid) return parsed.toUTC().toISO();
  }
  return now.plus({ hours: 24 }).toUTC().toISO();
}

function interestLevel(data: Record<string, unknown> | null) {
  const value = data?.interest_level;
  if (typeof value === "string" && interestLevels.has(value)) {
    return value as "high" | "medium" | "low" | "none";
  }
  return null;
}

export function planCallResult(input: {
  callStatus: string;
  lead: { attempts: number; phone: string } | null;
  maxAttempts: number;
  retryDelayMinutes: number;
  now: DateTime;
  result: CallResultInput;
}): PlannedCallResult {
  if (input.callStatus === "ended") {
    return { applied: false, call: null, lead: null, dncPhone: null };
  }

  const data = plainData(input.result.structuredData);
  const reason = input.result.endedReason?.trim() || null;
  const outcomeHint = input.result.outcome ?? "";
  const summary = cleanText(input.result.summary, 4000) ?? cleanText(data?.notes, 4000);
  const transcript = cleanText(input.result.transcript, 20000);
  const duration =
    typeof input.result.durationSeconds === "number" && input.result.durationSeconds >= 0
      ? Math.round(input.result.durationSeconds)
      : null;
  const endedAt = input.result.endedAt && DateTime.fromISO(input.result.endedAt).isValid
    ? input.result.endedAt
    : input.now.toUTC().toISO() ?? input.now.toISO() ?? "";

  const retry = input.lead
    ? retryAtIso(input.lead.attempts, input.maxAttempts, input.retryDelayMinutes, input.now)
    : null;

  let leadStatus = "completed";
  let leadInterest: "high" | "medium" | "low" | "none" | null = null;
  let callbackAt: string | null = null;
  let nextAttemptAt: string | null = null;
  let dncPhone: string | null = null;
  let callOutcome = "completed";

  const noAnswer =
    reason === "customer-did-not-answer" ||
    reason === "customer-busy" ||
    outcomeHint === "no_answer";
  const voicemail = reason === "voicemail" || outcomeHint === "voicemail";
  const providerError =
    reason === "timeout" ||
    outcomeHint === "failed" ||
    (reason != null && /error|failed|timeout/i.test(reason));

  if (flag(data, "do_not_call") || outcomeHint === "do_not_call") {
    leadStatus = "do_not_call";
    callOutcome = "do_not_call";
    dncPhone = input.lead?.phone ?? null;
  } else if (flag(data, "callback_requested") || outcomeHint === "callback") {
    leadStatus = "callback";
    callOutcome = "callback";
    callbackAt = callbackIso(data, input.now);
    leadInterest = flag(data, "interested") ? interestLevel(data) : null;
  } else if (voicemail) {
    leadStatus = "voicemail";
    callOutcome = "voicemail";
    nextAttemptAt = retry;
  } else if (noAnswer) {
    leadStatus = "no_answer";
    callOutcome = "no_answer";
    nextAttemptAt = retry;
  } else if (flag(data, "interested") || outcomeHint === "interested") {
    leadStatus = "interested";
    callOutcome = "interested";
    leadInterest = interestLevel(data);
  } else if (data?.interested === false || outcomeHint === "not_interested") {
    leadStatus = "not_interested";
    callOutcome = "not_interested";
  } else if (providerError) {
    leadStatus = "failed";
    callOutcome = "failed";
    nextAttemptAt = retry;
  }

  return {
    applied: true,
    dncPhone,
    call: {
      status: "ended",
      endedReason: reason,
      durationSeconds: duration,
      summary,
      transcript,
      structuredData: data,
      outcome: callOutcome,
      endedAt,
    },
    lead: input.lead
      ? {
          status: leadStatus,
          interestLevel: leadInterest,
          callbackAt,
          nextAttemptAt,
          summary,
        }
      : null,
  };
}

function oneRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function applyCallResult(
  supabase: SupabaseClient,
  callId: string,
  result: CallResultInput,
  now: DateTime = DateTime.utc(),
) {
  const loaded = await supabase
    .from("calls")
    .select(
      `
      id,
      status,
      leads ( id, attempts, phone_e164 ),
      campaigns ( owner_id, max_attempts, retry_delay_minutes )
    `,
    )
    .eq("id", callId)
    .maybeSingle();

  if (loaded.error || !loaded.data) return { applied: false as const };
  if (loaded.data.status === "ended") return { applied: false as const };

  const lead = oneRow(
    loaded.data.leads as
      | { id: string; attempts: number; phone_e164: string }
      | { id: string; attempts: number; phone_e164: string }[]
      | null,
  );
  const campaign = oneRow(
    loaded.data.campaigns as
      | { owner_id: string; max_attempts: number; retry_delay_minutes: number }
      | { owner_id: string; max_attempts: number; retry_delay_minutes: number }[]
      | null,
  );
  const plan = planCallResult({
    callStatus: String(loaded.data.status),
    lead: lead ? { attempts: lead.attempts, phone: lead.phone_e164 } : null,
    maxAttempts: campaign?.max_attempts ?? 1,
    retryDelayMinutes: campaign?.retry_delay_minutes ?? 120,
    now,
    result,
  });
  if (!plan.applied || !plan.call) return { applied: false as const };

  if (plan.lead && lead) {
    const leadUpdate = await supabase
      .from("leads")
      .update({
        status: plan.lead.status,
        interest_level: plan.lead.interestLevel,
        callback_at: plan.lead.callbackAt,
        next_attempt_at: plan.lead.nextAttemptAt,
        summary: plan.lead.summary,
      })
      .eq("id", lead.id);
    if (leadUpdate.error) return { applied: false as const };
  }

  const saved = await supabase
    .from("calls")
    .update({
      status: plan.call.status,
      ended_reason: plan.call.endedReason,
      duration_seconds: plan.call.durationSeconds,
      summary: plan.call.summary,
      transcript: plan.call.transcript,
      structured_data: plan.call.structuredData,
      outcome: plan.call.outcome,
      ended_at: plan.call.endedAt,
    })
    .eq("id", callId)
    .neq("status", "ended")
    .select("id");

  if (saved.error || !saved.data?.length) return { applied: false as const };

  if (plan.dncPhone && campaign?.owner_id) {
    await supabase.from("dnc_numbers").upsert(
      { owner_id: campaign.owner_id, phone_e164: plan.dncPhone },
      { onConflict: "owner_id,phone_e164", ignoreDuplicates: true },
    );
  }

  return { applied: true as const };
}
