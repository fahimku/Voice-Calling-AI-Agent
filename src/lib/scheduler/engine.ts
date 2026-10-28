import { DateTime } from "luxon";

import { planCallResult, type CallResultInput } from "@/lib/calls/applyCallResult";
import { computeBatchSize, countUsedToday } from "@/lib/scheduler/batch";
import { explainScheduler } from "@/lib/scheduler/explain";
import { claimCandidates, isLeadStillOpen, retryAtIso, type SchedulerLead } from "@/lib/scheduler/leads";
import { reconcileAction, stuckCallAfterMs } from "@/lib/scheduler/reconcile";
import { isCampaignOpen, type WindowCampaign } from "@/lib/scheduler/window";

export type TickCampaignResult = {
  campaignId: string;
  usedToday: number;
  limit: number;
  started: number;
  skippedReason?: string;
};

export type EngineCall = {
  id: string;
  leadId: string;
  providerCallId: string;
  status: "in_progress" | "ended" | "failed";
  isTest: boolean;
  attemptNumber: number;
  startedAt: string;
  endedReason: string | null;
  outcome: string | null;
};

export type EngineCampaign = WindowCampaign & {
  id: string;
  status: string;
  dailyLimit: number;
  maxConcurrent: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  countRetriesInLimit: boolean;
};

export type EngineState = {
  campaign: EngineCampaign;
  leads: SchedulerLead[];
  calls: EngineCall[];
  dnc: string[];
};

export async function runTick(
  state: EngineState,
  input: {
    now: DateTime;
    mode: "mock" | "live";
    startCall: (lead: SchedulerLead) => Promise<{ providerCallId: string }>;
    getCall: (providerCallId: string) => Promise<CallResultInput & { status?: string }>;
  },
): Promise<{ state: EngineState; result: TickCampaignResult }> {
  const next = structuredClone(state) as EngineState;
  const dnc = new Set(next.dnc);
  const nowIso = input.now.toUTC().toISO() ?? input.now.toISO() ?? "";

  for (const call of next.calls) {
    const action = reconcileAction(call, input.now, input.mode);
    if (action === "wait") continue;
    const providerResult =
      action === "timeout"
        ? { endedReason: "timeout", outcome: "failed", status: "ended" }
        : await input.getCall(call.providerCallId);
    if (action === "poll" && providerResult.status !== "ended" && providerResult.status !== "failed") continue;
    applyToCall(next, call, providerResult, input.now);
  }

  for (const lead of next.leads) {
    if (lead.status !== "calling") continue;
    if (next.calls.some((call) => call.leadId === lead.id && call.status === "in_progress")) continue;
    const stamp = [...next.calls].reverse().find((call) => call.leadId === lead.id)?.startedAt ?? lead.createdAt;
    const age = input.now.toMillis() - DateTime.fromISO(stamp, { zone: "utc" }).toMillis();
    if (age >= stuckCallAfterMs) {
      lead.status = "failed";
      lead.nextAttemptAt = retryAtIso(
        lead.attempts,
        next.campaign.maxAttempts,
        next.campaign.retryDelayMinutes,
        input.now,
      );
    }
  }

  const base = {
    campaignId: next.campaign.id,
    limit: next.campaign.dailyLimit,
    started: 0,
  };
  finishIfDone(next, dnc);

  if (next.campaign.status !== "active") {
    return { state: next, result: { ...base, usedToday: used(next, input.now), skippedReason: explainScheduler(next.campaign, input.now, emptyUsage(next, input.now, dnc)) } };
  }

  if (!isCampaignOpen(next.campaign, input.now)) {
    return { state: next, result: { ...base, usedToday: used(next, input.now), skippedReason: explainScheduler(next.campaign, input.now, emptyUsage(next, input.now, dnc)) } };
  }

  const usage = emptyUsage(next, input.now, dnc);
  const batch = computeBatchSize({
    dailyLimit: next.campaign.dailyLimit,
    usedToday: usage.usedToday,
    maxConcurrent: next.campaign.maxConcurrent,
    inProgress: usage.inProgress,
  });

  if (batch <= 0) {
    return { state: next, result: { ...base, usedToday: usage.usedToday, skippedReason: explainScheduler(next.campaign, input.now, usage) } };
  }

  const locked = new Set(next.leads.filter((lead) => lead.status === "calling").map((lead) => lead.id));
  const claimed = claimCandidates(next.leads, {
    lockedIds: locked,
    batchSize: batch,
    dnc,
    now: input.now,
    maxAttempts: next.campaign.maxAttempts,
  });

  let started = 0;
  for (const lead of claimed) {
    lead.status = "calling";
    lead.attempts += 1;
    const attemptNumber = lead.attempts;
    try {
      const placed = await input.startCall(lead);
      next.calls.push({
        id: `call-${next.calls.length + 1}`,
        leadId: lead.id,
        providerCallId: placed.providerCallId,
        status: "in_progress",
        isTest: false,
        attemptNumber,
        startedAt: nowIso,
        endedReason: null,
        outcome: null,
      });
      started += 1;
    } catch {
      lead.status = "failed";
      lead.nextAttemptAt = retryAtIso(lead.attempts, next.campaign.maxAttempts, next.campaign.retryDelayMinutes, input.now);
      next.calls.push({
        id: `call-${next.calls.length + 1}`,
        leadId: lead.id,
        providerCallId: "",
        status: "failed",
        isTest: false,
        attemptNumber,
        startedAt: nowIso,
        endedReason: "The call could not be started.",
        outcome: "failed",
      });
      started += 1;
    }
  }

  finishIfDone(next, dnc);

  const after = emptyUsage(next, input.now, dnc);
  return {
    state: next,
    result: {
      ...base,
      usedToday: after.usedToday,
      started,
      ...(started === 0 ? { skippedReason: claimed.length === 0 ? "No leads are waiting" : undefined } : {}),
    },
  };
}

function finishIfDone(state: EngineState, dnc: Set<string>) {
  if (state.campaign.status !== "active") return;
  if (!state.leads.some((lead) => isLeadStillOpen(lead, state.campaign, dnc))) {
    state.campaign.status = "completed";
  }
}

function applyToCall(state: EngineState, call: EngineCall, result: CallResultInput, now: DateTime) {
  const lead = state.leads.find((item) => item.id === call.leadId);
  const plan = planCallResult({
    callStatus: call.status,
    lead: lead ? { attempts: lead.attempts, phone: lead.phone } : null,
    maxAttempts: state.campaign.maxAttempts,
    retryDelayMinutes: state.campaign.retryDelayMinutes,
    now,
    result,
  });
  if (!plan.applied || !plan.call) return;
  call.status = "ended";
  call.endedReason = plan.call.endedReason;
  call.outcome = plan.call.outcome;
  if (lead && plan.lead) {
    lead.status = plan.lead.status;
    lead.nextAttemptAt = plan.lead.nextAttemptAt;
    lead.callbackAt = plan.lead.callbackAt;
  }
  if (plan.dncPhone) state.dnc.push(plan.dncPhone);
}

function used(state: EngineState, now: DateTime) {
  return countUsedToday(
    state.calls.map((call) => ({
      startedAt: call.startedAt,
      isTest: call.isTest,
      attemptNumber: call.attemptNumber,
    })),
    now,
    state.campaign.timezone,
    state.campaign.countRetriesInLimit,
  );
}

function emptyUsage(state: EngineState, now: DateTime, dnc: Set<string>) {
  return {
    usedToday: used(state, now),
    dailyLimit: state.campaign.dailyLimit,
    inProgress: state.leads.filter((lead) => lead.status === "calling").length,
    maxConcurrent: state.campaign.maxConcurrent,
    eligible: state.leads.filter((lead) =>
      claimCandidates([lead], {
        lockedIds: new Set(),
        batchSize: 1,
        dnc,
        now,
        maxAttempts: state.campaign.maxAttempts,
      }).length > 0,
    ).length,
  };
}
