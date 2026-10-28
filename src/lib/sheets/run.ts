import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSheetsApi } from "@/lib/sheets/google";
import { readSheetRuntime } from "@/lib/sheets/env";
import { publicSheetError } from "@/lib/sheets/retry";
import { createSheetSyncStore } from "@/lib/sheets/store";
import { syncCampaignToSheet, syncDirtyCampaigns } from "@/lib/sheets/sync";

export async function syncCampaignNow(supabase: SupabaseClient, campaignId: string) {
  const env = readSheetRuntime();
  if (!env.email || !env.privateKey) {
    return { skipped: false, updated: 0, error: "Google Sheets is not configured." };
  }
  return syncCampaignToSheet(createSheetSyncStore(supabase), createSheetsApi(env), campaignId, env);
}

export async function syncAllConnected(supabase: SupabaseClient) {
  const env = readSheetRuntime();
  if (!env.email || !env.privateKey) return [];
  try {
    return await syncDirtyCampaigns(createSheetSyncStore(supabase), createSheetsApi(env), env);
  } catch (error) {
    return [{ campaignId: "", ok: false, error: publicSheetError(error, env.secrets) }];
  }
}
