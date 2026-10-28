import { requireUser } from "@/lib/auth";
import type { CampaignStatus } from "@/lib/campaigns";
import { isMissingColumn } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone/normalize";
import { leadStatuses, type LeadStatus } from "@/lib/validation/leads";

export const LEADS_PAGE_SIZE = 25;

export type LeadCounts = {
  total: number;
  pending: number;
  interested: number;
  callback: number;
  no_answer: number;
  do_not_call: number;
  failed: number;
};

export type LeadListItem = {
  id: string;
  name: string | null;
  phone_e164: string;
  status: LeadStatus;
  interest_level: string | null;
  attempts: number;
  last_call_at: string | null;
  summary: string | null;
  created_at: string;
  sheetDirty: boolean | null;
};

export type LeadListQuery = {
  q: string;
  status: LeadStatus | null;
  page: number;
  sort: "asc" | "desc";
};

const countKeys = ["pending", "interested", "callback", "no_answer", "do_not_call", "failed"] as const;

function searchToken(value: string) {
  return value.replace(/[%_*,()]/g, "").trim();
}

async function countWhere(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  campaignId: string,
  status?: LeadStatus,
) {
  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw new Error("Could not load leads.");
  return count ?? 0;
}

export async function getOwnedCampaign(id: string) {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, owner_id, sheet_id")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw new Error("Could not load this campaign.");
  if (!data) return null;

  return {
    supabase,
    userId,
    campaign: {
      id: data.id as string,
      name: data.name as string,
      status: data.status as CampaignStatus,
      sheetId: (data.sheet_id as string | null) ?? null,
    },
  };
}

export async function getLeadCounts(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  campaignId: string,
): Promise<LeadCounts> {
  const [total, pending, interested, callback, noAnswer, doNotCall, failed] = await Promise.all([
    countWhere(supabase, campaignId),
    ...countKeys.map((status) => countWhere(supabase, campaignId, status)),
  ]);

  return {
    total,
    pending,
    interested,
    callback,
    no_answer: noAnswer,
    do_not_call: doNotCall,
    failed,
  };
}

export async function listLeads(campaignId: string, query: LeadListQuery) {
  const owned = await getOwnedCampaign(campaignId);
  if (!owned) return null;
  const scope = owned;

  const token = searchToken(query.q);
  const normalized = token ? normalizePhone(token) : null;
  let includeDirty = true;

  function pageQuery() {
    const request = includeDirty
      ? scope.supabase
          .from("leads")
          .select(
            "id, name, phone_e164, status, interest_level, attempts, last_call_at, summary, created_at, sheet_dirty",
            { count: "exact" },
          )
          .eq("campaign_id", campaignId)
      : scope.supabase
          .from("leads")
          .select("id, name, phone_e164, status, interest_level, attempts, last_call_at, summary, created_at", {
            count: "exact",
          })
          .eq("campaign_id", campaignId);

    const filtered = token
      ? request.or(
          [`name.ilike.%${token}%`, `phone_e164.ilike.%${token}%`, ...(normalized?.ok ? [`phone_e164.eq.${normalized.e164}`] : [])].join(
            ",",
          ),
        )
      : request;
    const scoped = query.status ? filtered.eq("status", query.status) : filtered;
    return scoped.order("created_at", { ascending: query.sort === "asc" });
  }

  const from = (query.page - 1) * LEADS_PAGE_SIZE;
  let first = await pageQuery().range(from, from + LEADS_PAGE_SIZE - 1);
  if (first.error && isMissingColumn(first.error)) {
    includeDirty = false;
    first = await pageQuery().range(from, from + LEADS_PAGE_SIZE - 1);
  }

  if (first.error) throw new Error("Could not load leads.");

  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  let rows = first.data;

  if (page !== query.page) {
    const retryFrom = (page - 1) * LEADS_PAGE_SIZE;
    const second = await pageQuery().range(retryFrom, retryFrom + LEADS_PAGE_SIZE - 1);
    if (second.error) throw new Error("Could not load leads.");
    rows = second.data;
  }

  const counts = await getLeadCounts(owned.supabase, campaignId);

  return {
    campaign: owned.campaign,
    leads: (rows ?? []).map((row) => mapLeadRow(row as LeadQueryRow, includeDirty)),
    total,
    page,
    pageCount,
    counts,
  };
}

type LeadQueryRow = {
  id: string;
  name: string | null;
  phone_e164: string;
  status: string;
  interest_level: string | null;
  attempts: number;
  last_call_at: string | null;
  summary: string | null;
  created_at: string;
  sheet_dirty?: boolean | null;
};

function mapLeadRow(row: LeadQueryRow, includeDirty: boolean): LeadListItem {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    phone_e164: String(row.phone_e164),
    status: row.status as LeadStatus,
    interest_level: (row.interest_level as string | null) ?? null,
    attempts: Number(row.attempts),
    last_call_at: (row.last_call_at as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    created_at: String(row.created_at),
    sheetDirty: includeDirty ? Boolean(row.sheet_dirty) : null,
  };
}

export async function listLeadsForExport(campaignId: string) {
  const owned = await getOwnedCampaign(campaignId);
  if (!owned) return null;

  const leads: LeadListItem[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await owned.supabase
      .from("leads")
      .select("id, name, phone_e164, status, interest_level, attempts, last_call_at, summary, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error("Could not export leads.");
    const batch = (data ?? []).map((row) => mapLeadRow(row as LeadQueryRow, false));
    leads.push(...batch);
    if (batch.length < pageSize) break;
  }

  return { campaign: owned.campaign, leads };
}

export async function findPhoneMatches(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  campaignId: string,
  phones: string[],
) {
  const existing = new Set<string>();
  const dnc = new Set<string>();
  const chunkSize = 200;

  for (let index = 0; index < phones.length; index += chunkSize) {
    const chunk = phones.slice(index, index + chunkSize);
    const [leadResult, dncResult] = await Promise.all([
      supabase.from("leads").select("phone_e164").eq("campaign_id", campaignId).in("phone_e164", chunk),
      supabase.from("dnc_numbers").select("phone_e164").eq("owner_id", userId).in("phone_e164", chunk),
    ]);

    if (leadResult.error || dncResult.error) {
      throw new Error("Could not check existing numbers.");
    }

    for (const row of leadResult.data ?? []) existing.add(row.phone_e164 as string);
    for (const row of dncResult.data ?? []) dnc.add(row.phone_e164 as string);
  }

  return { existing, dnc };
}

export function isLeadStatus(value: string): value is LeadStatus {
  return leadStatuses.some((status) => status === value);
}
