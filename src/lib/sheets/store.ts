import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumn } from "@/lib/db-error";
import { DIRTY_LEAD_LIMIT } from "@/lib/sheets/api";
import { sheetDateTime, sheetInterest } from "@/lib/sheets/cells";
import type { DirtyLead } from "@/lib/sheets/plan";
import { publicSheetError } from "@/lib/sheets/retry";
import type { SheetSyncStore } from "@/lib/sheets/sync";
import { leadStatusLabels, type LeadStatus } from "@/lib/validation/leads";

type LeadRow = {
  id: string;
  name: string | null;
  phone_e164: string;
  status: string;
  interest_level: string | null;
  callback_at: string | null;
  attempts: number;
  last_call_at: string | null;
  summary: string | null;
  sheet_row: number | null;
};

function notesFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const notes = (value as { notes?: unknown }).notes;
  return typeof notes === "string" ? notes : "";
}

function statusLabel(status: string) {
  if (status in leadStatusLabels) return leadStatusLabels[status as LeadStatus];
  return status;
}


export function createSheetSyncStore(supabase: SupabaseClient): SheetSyncStore {
  return {
    async loadCampaign(campaignId) {
      const row = await supabase
        .from("campaigns")
        .select("id, sheet_id, sheet_tab, timezone")
        .eq("id", campaignId)
        .maybeSingle();
      if (row.error && isMissingColumn(row.error)) {
        const base = await supabase.from("campaigns").select("id, sheet_id").eq("id", campaignId).maybeSingle();
        if (base.error || !base.data) return null;
        return { id: String(base.data.id), sheetId: (base.data.sheet_id as string | null) ?? null, tab: "Leads" };
      }
      if (row.error || !row.data) return null;
      const tab = typeof row.data.sheet_tab === "string" && row.data.sheet_tab.trim() ? row.data.sheet_tab.trim() : "Leads";
      const timezone = typeof row.data.timezone === "string" && row.data.timezone.trim() ? row.data.timezone : "Asia/Dubai";
      return { id: String(row.data.id), sheetId: (row.data.sheet_id as string | null) ?? null, tab, timezone };
    },

    async loadDirty(campaignId) {
      const campaign = await supabase.from("campaigns").select("timezone").eq("id", campaignId).maybeSingle();
      const zone =
        !campaign.error && typeof campaign.data?.timezone === "string" && campaign.data.timezone.trim()
          ? campaign.data.timezone
          : "Asia/Dubai";
      const leads = await supabase
        .from("leads")
        .select("id, name, phone_e164, status, interest_level, callback_at, attempts, last_call_at, summary, sheet_row")
        .eq("campaign_id", campaignId)
        .eq("sheet_dirty", true)
        .order("updated_at", { ascending: true })
        .limit(DIRTY_LEAD_LIMIT);
      if (leads.error) throw leads.error;
      const rows = (leads.data ?? []) as LeadRow[];
      const ids = rows.map((row) => row.id);
      const latest = new Map<string, { id: string; notes: string }>();
      if (ids.length > 0) {
        const calls = await supabase
          .from("calls")
          .select("id, lead_id, structured_data, created_at")
          .in("lead_id", ids)
          .eq("is_test", false)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (!calls.error) {
          for (const call of calls.data ?? []) {
            const leadId = String(call.lead_id ?? "");
            if (!leadId || latest.has(leadId)) continue;
            latest.set(leadId, { id: String(call.id), notes: notesFrom(call.structured_data) });
          }
        }
      }
      return rows.map((row): DirtyLead => {
        const call = latest.get(row.id);
        return {
          id: row.id,
          name: row.name,
          phone: row.phone_e164,
          status: statusLabel(row.status),
          interest: sheetInterest(row.interest_level),
          callbackAt: sheetDateTime(row.callback_at, zone),
          attempts: row.attempts,
          lastCallAt: sheetDateTime(row.last_call_at, zone),
          summary: row.summary,
          notes: call?.notes ?? "",
          sheetRow: row.sheet_row,
          callId: call?.id ?? null,
        };
      });
    },

    async markSynced(campaignId, rows, syncedAt) {
      for (const row of rows) {
        const updated = await supabase
          .from("leads")
          .update({ sheet_dirty: false, sheet_row: row.sheetRow })
          .eq("id", row.id)
          .eq("campaign_id", campaignId);
        if (updated.error) throw updated.error;
      }
      const campaign = await supabase
        .from("campaigns")
        .update({ sheet_last_synced_at: syncedAt, sheet_last_error: null })
        .eq("id", campaignId);
      if (campaign.error) throw campaign.error;
    },

    async markFailed(campaignId, message) {
      const result = await supabase
        .from("campaigns")
        .update({ sheet_last_error: message.slice(0, 300) })
        .eq("id", campaignId);
      if (result.error && !isMissingColumn(result.error)) throw new Error(publicSheetError(result.error));
    },

    async listConnectedDirty() {
      const campaigns = await supabase.from("campaigns").select("id, sheet_id").not("sheet_id", "is", null);
      if (campaigns.error) throw campaigns.error;
      const ids: string[] = [];
      for (const campaign of campaigns.data ?? []) {
        if (!campaign.sheet_id) continue;
        const dirty = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("sheet_dirty", true);
        if (dirty.error && isMissingColumn(dirty.error)) return [];
        if (dirty.error) throw dirty.error;
        if ((dirty.count ?? 0) > 0) ids.push(String(campaign.id));
      }
      return ids;
    },
  };
}
