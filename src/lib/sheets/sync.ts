import { migrationRequiredMessage, isMissingColumn } from "@/lib/db-error";
import { sheetDateTime } from "@/lib/sheets/cells";
import { appendRows, batchWriteRows, ensureHeaders, readRows, SheetAccessError, verifyAccess, type SheetsApi } from "@/lib/sheets/api";
import type { SheetRuntime } from "@/lib/sheets/env";
import { planSheetWrite, type DirtyLead } from "@/lib/sheets/plan";
import { publicSheetError } from "@/lib/sheets/retry";

export type SheetCampaign = {
  id: string;
  sheetId: string | null;
  tab: string;
  timezone?: string;
};

export type SheetSyncStore = {
  loadCampaign(campaignId: string): Promise<SheetCampaign | null>;
  loadDirty(campaignId: string): Promise<DirtyLead[]>;
  markSynced(campaignId: string, rows: Array<{ id: string; sheetRow: number }>, syncedAt: string): Promise<void>;
  markFailed(campaignId: string, message: string): Promise<void>;
  listConnectedDirty(): Promise<string[]>;
};

export type SyncOneResult = {
  skipped: boolean;
  updated: number;
  error?: string;
};

function syncMessage(error: unknown, secrets: string[]) {
  if (error instanceof SheetAccessError) return error.message;
  if (error && typeof error === "object" && isMissingColumn(error as { code?: string })) return migrationRequiredMessage;
  return publicSheetError(error, secrets);
}

export async function syncCampaignToSheet(
  store: SheetSyncStore,
  api: SheetsApi,
  campaignId: string,
  env: SheetRuntime,
): Promise<SyncOneResult> {
  const campaign = await store.loadCampaign(campaignId);
  if (!campaign?.sheetId) return { skipped: true, updated: 0 };
  const leads = await store.loadDirty(campaignId);
  if (leads.length === 0) return { skipped: true, updated: 0 };

  try {
    await verifyAccess(api, campaign.sheetId, campaign.tab, env.email);
    const grid = await readRows(api, campaign.sheetId, campaign.tab);
    const layout = await ensureHeaders(api, campaign.sheetId, campaign.tab, grid.headers);
    if (layout.nameIndex < 0 || layout.phoneIndex < 0) {
      throw new SheetAccessError("The sheet needs Name and Phone columns.");
    }
    const plan = planSheetWrite({
      tab: campaign.tab,
      layout,
      rows: grid.rows,
      leads,
      appUrl: env.appUrl,
      updatedAt: sheetDateTime(env.updatedAt, campaign.timezone || "Asia/Dubai"),
    });
    await batchWriteRows(
      api,
      campaign.sheetId,
      plan.updates.flatMap((update) => update.ranges),
    );
    const appended = await appendRows(api, campaign.sheetId, campaign.tab, plan.appends);
    const saved = [...plan.updates.map((row) => ({ id: row.leadId, sheetRow: row.sheetRow })), ...appended];
    await store.markSynced(campaignId, saved, env.updatedAt);
    return { skipped: false, updated: saved.length };
  } catch (error) {
    const message = syncMessage(error, env.secrets);
    try {
      await store.markFailed(campaignId, message);
    } catch {
      // The leads stay dirty for the next run.
    }
    env.log?.(message);
    return { skipped: false, updated: 0, error: message };
  }
}

export async function syncDirtyCampaigns(store: SheetSyncStore, api: SheetsApi, env: SheetRuntime) {
  const ids = await store.listConnectedDirty();
  const results: Array<{ campaignId: string; ok: boolean; error?: string }> = [];
  for (const campaignId of ids) {
    try {
      const result = await syncCampaignToSheet(store, api, campaignId, env);
      results.push({ campaignId, ok: !result.error, error: result.error });
    } catch (error) {
      const message = syncMessage(error, env.secrets);
      env.log?.(message);
      results.push({ campaignId, ok: false, error: message });
    }
  }
  return results;
}
