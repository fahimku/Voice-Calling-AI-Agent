import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import {
  buildOutcomeSeries,
  campaignsOutsideWindow,
  numberValue,
  type AttentionCampaign,
  type FunnelCounts,
  type OutcomeRow,
} from "@/lib/dashboard/aggregate";
import { isMissingColumn, isMissingFunction, migrationRequiredMessage } from "@/lib/db-error";
import { privateKeyFromEnv } from "@/lib/sheets/env";
import { maskPhone } from "@/lib/phone/normalize";

const chartDays = 14;

function one(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

function firstRow(value: unknown) {
  if (Array.isArray(value)) return one(value[0]);
  return one(value);
}

export type DashboardCall = {
  id: string;
  startedAt: string | null;
  campaignName: string;
  leadName: string | null;
  maskedPhone: string;
  outcome: string | null;
  costUsd: number | null;
  costIsMock: boolean;
};

export type DashboardData = {
  migrationRequired: boolean;
  usage: {
    callsToday: number;
    dailyLimit: number;
    interestedThisWeek: number;
    callbacksDue: number;
    callsThisMonth: number;
    costThisMonth: number;
    mockCostThisMonth: number;
  };
  series: ReturnType<typeof buildOutcomeSeries>;
  campaigns: { id: string; name: string }[];
  selectedCampaignId: string;
  funnel: FunnelCounts;
  attention: {
    sheetErrors: { id: string; name: string; error: string }[];
    failedCalls: { id: string; campaignName: string; startedAt: string | null }[];
    outsideWindow: { id: string; name: string; reason: string }[];
    callbacks: { id: string; name: string; campaignName: string; callbackAt: string | null }[];
  };
  recent: DashboardCall[];
};

function emptyUsage() {
  return {
    callsToday: 0,
    dailyLimit: 0,
    interestedThisWeek: 0,
    callbacksDue: 0,
    callsThisMonth: 0,
    costThisMonth: 0,
    mockCostThisMonth: 0,
  };
}

export async function loadDashboard(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  now = DateTime.utc(),
): Promise<DashboardData> {
  const local = now.setZone("Asia/Dubai");
  const start = local.startOf("day").minus({ days: chartDays - 1 });
  const end = local.startOf("day").plus({ days: 1 });
  const failedSince = now.minus({ hours: 24 }).toUTC().toISO();

  const [usageResult, outcomeResult, campaignResult, recent] = await Promise.all([
    supabase.rpc("dashboard_usage", { p_now: now.toUTC().toISO() }),
    supabase.rpc("dashboard_outcomes", { p_from: start.toUTC().toISO(), p_to: end.toUTC().toISO() }),
    supabase
      .from("campaigns")
      .select("id, name, status, timezone, window_start, window_end, active_days, sheet_last_error")
      .eq("owner_id", userId)
      .order("name"),
    loadRecent(supabase, userId),
  ]);

  const migrationRequired = isMissingFunction(usageResult.error) || isMissingFunction(outcomeResult.error);

  const campaigns = ((campaignResult.data ?? []) as { id: string; name: string; status: string; timezone: string; window_start: string; window_end: string; active_days: number[] | null; sheet_last_error: string | null }[]);
  const selected = campaigns.some((campaign) => campaign.id === campaignId) ? campaignId : (campaigns[0]?.id ?? "");

  const usageRow = firstRow(usageResult.data);
  const usage = usageRow
    ? {
        callsToday: numberValue(usageRow.calls_today),
        dailyLimit: numberValue(usageRow.daily_limit),
        interestedThisWeek: numberValue(usageRow.interested_this_week),
        callbacksDue: numberValue(usageRow.callbacks_due),
        callsThisMonth: numberValue(usageRow.calls_this_month),
        costThisMonth: numberValue(usageRow.cost_this_month),
        mockCostThisMonth: numberValue(usageRow.mock_cost_this_month),
      }
    : emptyUsage();

  const outcomeRows: OutcomeRow[] = ((outcomeResult.data ?? []) as { day: string; outcome: string; total: number | string }[]).map(
    (row) => ({
      day: String(row.day),
      outcome: String(row.outcome),
      total: numberValue(row.total),
    }),
  );

  const funnel = selected ? await loadFunnel(supabase, selected) : { total: 0, called: 0, answered: 0, interested: 0 };
  const callbacks = await loadCallbacks(supabase, userId, now.toUTC().toISO() ?? "");
  const failed = await loadFailed(supabase, userId, failedSince);

  const active: AttentionCampaign[] = campaigns
    .filter((campaign) => campaign.status === "active")
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      timezone: campaign.timezone,
      activeDays: campaign.active_days ?? [],
      windowStart: campaign.window_start,
      windowEnd: campaign.window_end,
    }));

  return {
    migrationRequired,
    usage,
    series: buildOutcomeSeries(start.toISODate() ?? "", chartDays, outcomeRows),
    campaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })),
    selectedCampaignId: selected,
    funnel,
    attention: {
      sheetErrors: campaigns.flatMap((campaign) =>
        campaign.sheet_last_error ? [{ id: campaign.id, name: campaign.name, error: campaign.sheet_last_error }] : [],
      ),
      failedCalls: failed,
      outsideWindow: campaignsOutsideWindow(active, now),
      callbacks,
    },
    recent,
  };
}

async function loadRecent(supabase: SupabaseClient, userId: string): Promise<DashboardCall[]> {
  const withCost = await supabase
    .from("calls")
    .select("id, started_at, outcome, cost_usd, cost_is_mock, campaigns!inner(name, owner_id), leads(name, phone_e164)")
    .eq("campaigns.owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const plain =
    withCost.error && isMissingColumn(withCost.error)
      ? await supabase
          .from("calls")
          .select("id, started_at, outcome, campaigns!inner(name, owner_id), leads(name, phone_e164)")
          .eq("campaigns.owner_id", userId)
          .order("created_at", { ascending: false })
          .limit(10)
      : null;
  const rows = (plain ? plain.data : withCost.data) as Record<string, unknown>[] | null;
  if ((plain ? plain.error : withCost.error) || !rows) return [];
  return rows.map((row) => {
    const campaign = one(row.campaigns);
    const lead = one(row.leads);
    const phone = lead && typeof lead.phone_e164 === "string" ? lead.phone_e164 : "";
    return {
      id: String(row.id),
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      campaignName: campaign && typeof campaign.name === "string" ? campaign.name : "Campaign",
      leadName: lead && typeof lead.name === "string" ? lead.name : null,
      maskedPhone: phone ? maskPhone(phone) : "—",
      outcome: typeof row.outcome === "string" ? row.outcome : null,
      costUsd: row.cost_usd == null ? null : numberValue(row.cost_usd),
      costIsMock: row.cost_is_mock === true,
    };
  });
}

async function loadFunnel(supabase: SupabaseClient, campaignId: string): Promise<FunnelCounts> {
  const result = await supabase.rpc("dashboard_funnel", { p_campaign_id: campaignId });
  const row = firstRow(result.data);
  if (!row) return { total: 0, called: 0, answered: 0, interested: 0 };
  return {
    total: numberValue(row.total_leads),
    called: numberValue(row.called),
    answered: numberValue(row.answered),
    interested: numberValue(row.interested),
  };
}

async function loadCallbacks(supabase: SupabaseClient, userId: string, nowIso: string) {
  const result = await supabase
    .from("leads")
    .select("id, name, callback_at, campaigns!inner(name, owner_id)")
    .eq("campaigns.owner_id", userId)
    .eq("status", "callback")
    .lte("callback_at", nowIso)
    .order("callback_at", { ascending: true })
    .limit(8);
  if (result.error) return [];
  return (result.data ?? []).map((row) => {
    const campaign = one(row.campaigns);
    return {
      id: String(row.id),
      name: typeof row.name === "string" && row.name.trim() ? row.name : "Lead",
      campaignName: campaign && typeof campaign.name === "string" ? campaign.name : "Campaign",
      callbackAt: typeof row.callback_at === "string" ? row.callback_at : null,
    };
  });
}

async function loadFailed(supabase: SupabaseClient, userId: string, since: string | null) {
  if (!since) return [];
  const result = await supabase
    .from("calls")
    .select("id, started_at, campaigns!inner(name, owner_id)")
    .eq("campaigns.owner_id", userId)
    .or("status.eq.failed,outcome.eq.failed")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(8);
  if (result.error) return [];
  return (result.data ?? []).map((row) => {
    const campaign = one(row.campaigns);
    return {
      id: String(row.id),
      campaignName: campaign && typeof campaign.name === "string" ? campaign.name : "Campaign",
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
    };
  });
}

export function migrationNotice() {
  return migrationRequiredMessage;
}

export function googleCredentialsReady() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const key = privateKeyFromEnv(process.env.GOOGLE_PRIVATE_KEY);
  return email.includes("@") && key.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY");
}

export function secretPresent(name: "VAPI_API_KEY" | "VAPI_WEBHOOK_SECRET" | "CRON_SECRET") {
  return Boolean(process.env[name]?.trim());
}
