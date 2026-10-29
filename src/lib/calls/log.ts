import { DateTime } from "luxon";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { isMissingColumn } from "@/lib/db-error";
import { maskPhone } from "@/lib/phone/normalize";
import { defaultTablePageSize, parsePageSize, type TablePageSize } from "@/lib/table-page";

export const callOutcomes = [
  "no_answer",
  "voicemail",
  "interested",
  "not_interested",
  "callback",
  "do_not_call",
  "failed",
  "completed",
] as const;

export const callOutcomeLabels: Record<(typeof callOutcomes)[number], string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  interested: "Interested",
  not_interested: "Not interested",
  callback: "Callback",
  do_not_call: "Do not call",
  failed: "Failed",
  completed: "Completed",
};

export type CallLogQuery = {
  campaign: string;
  outcome: string;
  from: string;
  to: string;
  kind: "all" | "test" | "real";
  page: number;
  pageSize: TablePageSize;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseCallLogQuery(input: {
  campaign?: string;
  outcome?: string;
  from?: string;
  to?: string;
  kind?: string;
  page?: string;
  per?: string;
}): CallLogQuery {
  const page = Number(input.page);
  const outcome = callOutcomes.find((item) => item === input.outcome) ?? "";
  return {
    campaign: z.uuid().safeParse(input.campaign).success ? (input.campaign ?? "") : "",
    outcome,
    from: input.from && dayPattern.test(input.from) ? input.from : "",
    to: input.to && dayPattern.test(input.to) ? input.to : "",
    kind: input.kind === "test" || input.kind === "real" ? input.kind : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: parsePageSize(input.per),
  };
}

export function callLogHref(query: CallLogQuery, patch: Partial<CallLogQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.campaign) params.set("campaign", next.campaign);
  if (next.outcome) params.set("outcome", next.outcome);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.kind !== "all") params.set("kind", next.kind);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== defaultTablePageSize) params.set("per", String(next.pageSize));
  const search = params.toString();
  return `/calls${search ? `?${search}` : ""}`;
}

function dubaiStart(day: string) {
  const date = DateTime.fromISO(day, { zone: "Asia/Dubai" });
  return date.isValid ? date.startOf("day").toUTC().toISO() : null;
}

function one(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

export type CallLogItem = {
  id: string;
  startedAt: string | null;
  campaignName: string;
  leadName: string | null;
  maskedPhone: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  attemptNumber: number | null;
  isTest: boolean;
};

export async function listCallLog(query: CallLogQuery) {
  const { supabase, userId } = await requireUser();
  let request = supabase
    .from("calls")
    .select(
      `
      id, started_at, status, outcome, duration_seconds, attempt_number, is_test,
      campaigns!inner ( name, owner_id ),
      leads ( name, phone_e164 )
    `,
      { count: "exact" },
    )
    .eq("campaigns.owner_id", userId)
    .order("created_at", { ascending: false });

  if (query.campaign) request = request.eq("campaign_id", query.campaign);
  if (query.outcome) request = request.eq("outcome", query.outcome);
  if (query.kind === "test") request = request.eq("is_test", true);
  if (query.kind === "real") request = request.eq("is_test", false);
  const from = query.from ? dubaiStart(query.from) : null;
  const to = query.to ? dubaiStart(query.to) : null;
  if (from) request = request.gte("started_at", from);
  if (to) {
    const end = DateTime.fromISO(to).plus({ days: 1 }).toUTC().toISO();
    if (end) request = request.lt("started_at", end);
  }

  const start = (query.page - 1) * query.pageSize;
  const result = await request.range(start, start + query.pageSize - 1);
  if (result.error) return { ok: false as const, message: "Could not load calls." };

  const calls: CallLogItem[] = (result.data ?? []).map((row) => {
    const campaign = one(row.campaigns);
    const lead = one(row.leads);
    const phone = lead && typeof lead.phone_e164 === "string" ? lead.phone_e164 : "";
    return {
      id: String(row.id),
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      campaignName: campaign && typeof campaign.name === "string" ? campaign.name : "Campaign",
      leadName: lead && typeof lead.name === "string" ? lead.name : null,
      maskedPhone: phone ? maskPhone(phone) : "—",
      status: String(row.status),
      outcome: typeof row.outcome === "string" ? row.outcome : null,
      durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      attemptNumber: typeof row.attempt_number === "number" ? row.attempt_number : null,
      isTest: row.is_test === true,
    };
  });

  return { ok: true as const, calls, total: result.count ?? 0 };
}

export type CallDetail = {
  id: string;
  campaignId: string;
  campaignName: string;
  leadId: string | null;
  leadName: string | null;
  maskedPhone: string;
  leadSearch: string | null;
  status: string;
  outcome: string | null;
  endedReason: string | null;
  summary: string | null;
  transcript: string | null;
  structured: Record<string, unknown> | null;
  recordingAvailable: boolean;
  durationSeconds: number | null;
  startedAt: string | null;
  doNotCall: boolean;
  costUsd: number | null;
  costIsMock: boolean;
};

export async function getCallDetail(id: string) {
  const { supabase, userId } = await requireUser();
  const columns = `
      id, campaign_id, lead_id, status, outcome, ended_reason, summary, transcript,
      structured_data, recording_ref, duration_seconds, started_at,
      campaigns!inner ( name, owner_id ),
      leads ( id, name, phone_e164, status )
    `;
  let result = await supabase
    .from("calls")
    .select(`${columns}, cost_usd, cost_is_mock`)
    .eq("id", id)
    .eq("campaigns.owner_id", userId)
    .maybeSingle();
  if (result.error && isMissingColumn(result.error)) {
    result = await supabase.from("calls").select(columns).eq("id", id).eq("campaigns.owner_id", userId).maybeSingle();
  }

  if (result.error || !result.data) return null;
  const row = result.data;
  const campaign = one(row.campaigns);
  const lead = one(row.leads);
  const phone = lead && typeof lead.phone_e164 === "string" ? lead.phone_e164 : "";
  const leadName = lead && typeof lead.name === "string" ? lead.name : null;
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    campaignName: campaign && typeof campaign.name === "string" ? campaign.name : "Campaign",
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    leadName,
    maskedPhone: phone ? maskPhone(phone) : "—",
    leadSearch: leadName,
    status: String(row.status),
    outcome: typeof row.outcome === "string" ? row.outcome : null,
    endedReason: typeof row.ended_reason === "string" ? row.ended_reason : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    transcript: typeof row.transcript === "string" ? row.transcript : null,
    structured: row.structured_data && typeof row.structured_data === "object" && !Array.isArray(row.structured_data)
      ? (row.structured_data as Record<string, unknown>)
      : null,
    recordingAvailable: typeof row.recording_ref === "string" && row.recording_ref.startsWith("vapi:"),
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    doNotCall: row.outcome === "do_not_call",
    costUsd: typeof row.cost_usd === "number" ? row.cost_usd : row.cost_usd == null ? null : Number(row.cost_usd),
    costIsMock: row.cost_is_mock === true,
  } satisfies CallDetail;
}
