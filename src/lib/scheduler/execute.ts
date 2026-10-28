import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { applyCallResult } from "@/lib/calls/applyCallResult";
import { isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import { callPromptVariables } from "@/lib/providers/variables";
import { getVoiceProvider } from "@/lib/providers";
import { voiceProviderMode } from "@/lib/providers/mode";
import { computeBatchSize } from "@/lib/scheduler/batch";
import { explainScheduler } from "@/lib/scheduler/explain";
import { isLeadEligible, retryAtIso } from "@/lib/scheduler/leads";
import { callAgeMs, reconcileAction, stuckCallAfterMs } from "@/lib/scheduler/reconcile";
import type { TickCampaignResult } from "@/lib/scheduler/engine";
import { isCampaignOpen } from "@/lib/scheduler/window";

type AgentEmbed = {
  provider_assistant_id: string;
  provider_phone_number_id: string | null;
  agent_display_name: string | null;
  business_name: string | null;
  variables: Record<string, unknown> | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function migrationError(error: { code?: string } | null) {
  return Boolean(error && (isMissingColumn(error) || error.code === "PGRST202" || error.code === "42883"));
}

export async function executeCampaignTick(
  supabase: SupabaseClient,
  campaignId: string,
  now: DateTime = DateTime.utc(),
): Promise<TickCampaignResult> {
  const loaded = await supabase
    .from("campaigns")
    .select(
      `
      id, owner_id, status, timezone, daily_limit, window_start, window_end, active_days,
      max_concurrent, max_attempts, retry_delay_minutes, count_retries_in_limit,
      agents ( provider_assistant_id, provider_phone_number_id, agent_display_name, business_name, variables )
    `,
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (migrationError(loaded.error)) {
    return { campaignId, usedToday: 0, limit: 0, started: 0, skippedReason: migrationRequiredMessage };
  }
  if (loaded.error || !loaded.data) {
    return { campaignId, usedToday: 0, limit: 0, started: 0, skippedReason: "Campaign not found." };
  }

  const row = loaded.data;
  const agent = one(row.agents as AgentEmbed | AgentEmbed[] | null);
  const campaign = {
    id: row.id as string,
    status: String(row.status),
    timezone: String(row.timezone),
    activeDays: (row.active_days as number[]) ?? [],
    windowStart: String(row.window_start),
    windowEnd: String(row.window_end),
    dailyLimit: Number(row.daily_limit),
    maxConcurrent: Number(row.max_concurrent),
    maxAttempts: Number(row.max_attempts),
    retryDelayMinutes: Number(row.retry_delay_minutes),
    countRetriesInLimit: Boolean(row.count_retries_in_limit),
    ownerId: String(row.owner_id),
  };

  await reconcileCampaign(supabase, campaign, now);

  const usedToday = await usedTodayCount(supabase, campaign.id);
  const inProgress = await callingCount(supabase, campaign.id);
  const eligible = await eligibleCount(supabase, campaign, now);
  const usage = {
    usedToday,
    dailyLimit: campaign.dailyLimit,
    inProgress,
    maxConcurrent: campaign.maxConcurrent,
    eligible,
  };
  const base = { campaignId: campaign.id, usedToday, limit: campaign.dailyLimit, started: 0 };

  if (campaign.status !== "active" || !isCampaignOpen(campaign, now)) {
    return { ...base, skippedReason: explainScheduler(campaign, now, usage) };
  }

  const mode = voiceProviderMode();
  if (!agent?.provider_assistant_id) {
    return { ...base, skippedReason: "This agent needs a Vapi assistant ID." };
  }
  if (mode === "live" && !agent.provider_phone_number_id) {
    return { ...base, skippedReason: "Add a Vapi phone number ID on this agent before live calls." };
  }

  const batch = computeBatchSize({
    dailyLimit: campaign.dailyLimit,
    usedToday,
    maxConcurrent: campaign.maxConcurrent,
    inProgress,
  });
  if (batch <= 0) {
    return { ...base, skippedReason: explainScheduler(campaign, now, usage) };
  }

  let provider;
  try {
    provider = getVoiceProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The voice provider is not configured.";
    return { ...base, skippedReason: message };
  }

  const claimed = await supabase.rpc("claim_leads_for_campaign", {
    p_campaign_id: campaign.id,
    p_batch_size: batch,
  });
  if (migrationError(claimed.error)) {
    return { ...base, skippedReason: migrationRequiredMessage };
  }
  if (claimed.error) {
    return { ...base, skippedReason: "Could not claim leads." };
  }

  const leads = (claimed.data ?? []) as {
    id: string;
    name: string | null;
    phone_e164: string;
    attempts: number;
  }[];
  let started = 0;
  for (const lead of leads) {
    const customerName = lead.name?.trim() || "";
    try {
      const placed = await provider.startCall({
        to: lead.phone_e164,
        customerName: customerName || undefined,
        assistantId: agent.provider_assistant_id,
        phoneNumberId: agent.provider_phone_number_id ?? "",
        variables: callPromptVariables({
          agentVariables: agent.variables,
          agentName: agent.agent_display_name,
          businessName: agent.business_name,
          customerName,
        }),
      });
      const inserted = await supabase.from("calls").insert({
        campaign_id: campaign.id,
        lead_id: lead.id,
        provider_call_id: placed.providerCallId,
        status: "in_progress",
        started_at: now.toUTC().toISO(),
        is_test: false,
        attempt_number: lead.attempts,
      });
      if (inserted.error) {
        await markStartFailed(supabase, campaign, lead.id, lead.attempts, now);
      }
      started += 1;
    } catch {
      await markStartFailed(supabase, campaign, lead.id, lead.attempts, now);
      started += 1;
    }
  }

  await completeIfFinished(supabase, campaign.id, campaign.maxAttempts, campaign.ownerId);
  const after = await usedTodayCount(supabase, campaign.id);
  if (started === 0) {
    return {
      campaignId: campaign.id,
      usedToday: after,
      limit: campaign.dailyLimit,
      started: 0,
      skippedReason: explainScheduler(campaign, now, { ...usage, usedToday: after, eligible: 0 }),
    };
  }
  return { campaignId: campaign.id, usedToday: after, limit: campaign.dailyLimit, started };
}

async function reconcileCampaign(
  supabase: SupabaseClient,
  campaign: { id: string; maxAttempts: number; retryDelayMinutes: number },
  now: DateTime,
) {
  const calls = await supabase
    .from("calls")
    .select("id, lead_id, provider_call_id, status, started_at")
    .eq("campaign_id", campaign.id)
    .eq("is_test", false)
    .eq("status", "in_progress");
  if (calls.error || !calls.data) return;

  const mode = voiceProviderMode();
  let provider: ReturnType<typeof getVoiceProvider> | null = null;
  for (const call of calls.data) {
    const action = reconcileAction(
      { status: String(call.status), startedAt: typeof call.started_at === "string" ? call.started_at : null },
      now,
      mode,
    );
    if (action === "wait" || !call.id) continue;
    const age = callAgeMs(typeof call.started_at === "string" ? call.started_at : null, now) ?? 0;
    const timeout = { endedReason: "timeout", outcome: "failed" as const };
    if (action === "timeout" || !call.provider_call_id) {
      if (action === "timeout" || age >= stuckCallAfterMs) {
        await applyCallResult(supabase, String(call.id), timeout, now);
      }
      continue;
    }
    try {
      provider ??= getVoiceProvider();
      const snapshot = await provider.getCall(String(call.provider_call_id));
      if (snapshot.status === "ended" || snapshot.status === "failed") {
        await applyCallResult(supabase, String(call.id), snapshot, now);
        continue;
      }
    } catch {
      // A lost webhook falls through to the timeout once the call is old enough.
    }
    if (age >= stuckCallAfterMs) {
      await applyCallResult(supabase, String(call.id), timeout, now);
    }
  }

  const cutoff = now.minus({ milliseconds: stuckCallAfterMs }).toUTC().toISO();
  const orphans = await supabase
    .from("leads")
    .select("id, attempts")
    .eq("campaign_id", campaign.id)
    .eq("status", "calling")
    .lt("last_call_at", cutoff);
  if (orphans.error || !orphans.data) return;
  const busy = new Set(calls.data.map((call) => call.lead_id).filter(Boolean));
  for (const lead of orphans.data) {
    if (busy.has(lead.id)) continue;
    await supabase
      .from("leads")
      .update({
        status: "failed",
        next_attempt_at: retryAtIso(Number(lead.attempts), campaign.maxAttempts, campaign.retryDelayMinutes, now),
      })
      .eq("id", lead.id)
      .eq("status", "calling");
  }
}

async function markStartFailed(
  supabase: SupabaseClient,
  campaign: { id: string; maxAttempts: number; retryDelayMinutes: number },
  leadId: string,
  attempts: number,
  now: DateTime,
) {
  await supabase.from("calls").insert({
    campaign_id: campaign.id,
    lead_id: leadId,
    status: "failed",
    is_test: false,
    attempt_number: attempts,
    started_at: now.toUTC().toISO(),
    ended_at: now.toUTC().toISO(),
    ended_reason: "The call could not be started.",
    outcome: "failed",
  });
  await supabase
    .from("leads")
    .update({
      status: "failed",
      next_attempt_at: retryAtIso(attempts, campaign.maxAttempts, campaign.retryDelayMinutes, now),
      summary: "The call could not be started.",
    })
    .eq("id", leadId)
    .eq("status", "calling");
}

async function usedTodayCount(supabase: SupabaseClient, campaignId: string) {
  const result = await supabase.rpc("campaign_calls_used_today", { p_campaign_id: campaignId });
  if (result.error || typeof result.data !== "number") return 0;
  return result.data;
}

async function callingCount(supabase: SupabaseClient, campaignId: string) {
  const result = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "calling");
  return result.count ?? 0;
}

async function eligibleCount(
  supabase: SupabaseClient,
  campaign: { id: string; ownerId: string; maxAttempts: number },
  now: DateTime,
) {
  const [leads, dnc] = await Promise.all([
    supabase
      .from("leads")
      .select("status, attempts, next_attempt_at, callback_at, phone_e164")
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "no_answer", "voicemail", "failed", "callback"])
      .limit(1000),
    supabase.from("dnc_numbers").select("phone_e164").eq("owner_id", campaign.ownerId),
  ]);
  if (leads.error || !leads.data) return 0;
  const blocked = new Set((dnc.data ?? []).map((row) => String(row.phone_e164)));
  return leads.data.filter((lead) =>
    isLeadEligible(
      {
        status: String(lead.status),
        attempts: Number(lead.attempts),
        nextAttemptAt: typeof lead.next_attempt_at === "string" ? lead.next_attempt_at : null,
        callbackAt: typeof lead.callback_at === "string" ? lead.callback_at : null,
        phone: String(lead.phone_e164),
      },
      campaign,
      now,
      blocked,
    ),
  ).length;
}

async function completeIfFinished(
  supabase: SupabaseClient,
  campaignId: string,
  maxAttempts: number,
  ownerId: string,
) {
  const [calling, callbacks, retries, pending, dnc] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "calling"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "callback"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["no_answer", "voicemail", "failed"])
      .lt("attempts", maxAttempts),
    supabase.from("leads").select("phone_e164").eq("campaign_id", campaignId).eq("status", "pending").limit(1000),
    supabase.from("dnc_numbers").select("phone_e164").eq("owner_id", ownerId),
  ]);
  if ((calling.count ?? 0) > 0 || (callbacks.count ?? 0) > 0 || (retries.count ?? 0) > 0) return;
  const blocked = new Set((dnc.data ?? []).map((row) => String(row.phone_e164)));
  const pendingRows = pending.data ?? [];
  if (pendingRows.length >= 1000) return;
  if (pendingRows.some((row) => !blocked.has(String(row.phone_e164)))) return;
  await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId).eq("status", "active");
}

export async function executeActiveTicks(supabase: SupabaseClient, now: DateTime = DateTime.utc()) {
  const active = await supabase.from("campaigns").select("id").eq("status", "active");
  if (active.error || !active.data) return [];
  const results: TickCampaignResult[] = [];
  for (const row of active.data) {
    try {
      results.push(await executeCampaignTick(supabase, String(row.id), now));
    } catch {
      results.push({
        campaignId: String(row.id),
        usedToday: 0,
        limit: 0,
        started: 0,
        skippedReason: "Could not run this campaign.",
      });
    }
  }
  return results;
}
