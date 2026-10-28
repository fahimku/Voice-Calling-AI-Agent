"use server";

import { revalidatePath } from "next/cache";

import { getOwnedCampaign, findPhoneMatches } from "@/lib/leads";
import { importLimitError, mapLeadRows, previewImport, PREVIEW_ROW_LIMIT } from "@/lib/leads/preview";
import { normalizePhone } from "@/lib/phone/normalize";
import { isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import { readRows, SheetAccessError, verifyAccess, permissionHint } from "@/lib/sheets/api";
import { readSheetRuntime } from "@/lib/sheets/env";
import { createSheetsApi } from "@/lib/sheets/google";
import { planHeaders } from "@/lib/sheets/headers";
import { parseSheetId } from "@/lib/sheets/parse";
import { publicSheetError } from "@/lib/sheets/retry";
import { syncCampaignNow } from "@/lib/sheets/run";
import { ownedCampaignError, sheetActionsAllowed } from "@/lib/validation/campaigns";
import { sheetConnectionSchema } from "@/lib/validation/sheets";

function revalidateCampaign(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/leads`);
}

function sheetFailure(error: unknown, secrets: string[]) {
  if (error instanceof SheetAccessError) return error.message;
  return publicSheetError(error, secrets);
}

async function ownedCampaign(campaignId: string) {
  const owned = await getOwnedCampaign(campaignId);
  const missing = ownedCampaignError({ queryFailed: false, found: Boolean(owned) });
  if (!owned || missing) return { error: missing ?? "Campaign not found." };
  if (!sheetActionsAllowed(owned.campaign.status)) {
    return { error: "Could not use the Google Sheet for this campaign." };
  }
  return { owned };
}

function sheetsRuntime() {
  const env = readSheetRuntime();
  if (!env.email || !env.privateKey) return { error: "Google Sheets is not configured." as const };
  return { env };
}

export async function saveSheetConnection(campaignId: string, sheet: string, tab: string) {
  const parsed = sheetConnectionSchema.safeParse({ campaignId, sheet, tab });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the sheet link and tab." };
  const sheetId = parseSheetId(parsed.data.sheet);
  if (!sheetId) return { error: "Enter a Google Sheet link or the sheet ID." };

  const campaign = await ownedCampaign(parsed.data.campaignId);
  if ("error" in campaign) return campaign;

  const saved = await campaign.owned.supabase
    .from("campaigns")
    .update({ sheet_id: sheetId, sheet_tab: parsed.data.tab, sheet_last_error: null })
    .eq("id", campaign.owned.campaign.id)
    .eq("owner_id", campaign.owned.userId);
  if (saved.error && isMissingColumn(saved.error)) return { error: migrationRequiredMessage };
  if (saved.error) return { error: "Could not save the Google Sheet." };

  revalidateCampaign(campaign.owned.campaign.id);
  return { ok: true as const, message: "Google Sheet saved." };
}

export async function testSheetConnection(campaignId: string, sheet: string, tab: string) {
  const parsed = sheetConnectionSchema.safeParse({ campaignId, sheet, tab });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the sheet link and tab." };
  const sheetId = parseSheetId(parsed.data.sheet);
  if (!sheetId) return { error: "Enter a Google Sheet link or the sheet ID." };

  const campaign = await ownedCampaign(parsed.data.campaignId);
  if ("error" in campaign) return campaign;
  const runtime = sheetsRuntime();
  if ("error" in runtime) return runtime;

  try {
    await verifyAccess(createSheetsApi(runtime.env), sheetId, parsed.data.tab, runtime.env.email);
  } catch (error) {
    return { error: sheetFailure(error, runtime.env.secrets) };
  }
  return { ok: true as const, message: `Connected. ${permissionHint(runtime.env.email)}` };
}

export async function disconnectSheet(campaignId: string) {
  const campaign = await ownedCampaign(campaignId);
  if ("error" in campaign) return campaign;

  const cleared = await campaign.owned.supabase
    .from("campaigns")
    .update({
      sheet_id: null,
      sheet_tab: "Leads",
      sheet_last_synced_at: null,
      sheet_last_error: null,
    })
    .eq("id", campaign.owned.campaign.id)
    .eq("owner_id", campaign.owned.userId);

  if (cleared.error && isMissingColumn(cleared.error)) {
    const idOnly = await campaign.owned.supabase
      .from("campaigns")
      .update({ sheet_id: null })
      .eq("id", campaign.owned.campaign.id)
      .eq("owner_id", campaign.owned.userId);
    if (idOnly.error) return { error: "Could not disconnect the Google Sheet." };
    revalidateCampaign(campaign.owned.campaign.id);
    return { error: migrationRequiredMessage };
  }
  if (cleared.error) return { error: "Could not disconnect the Google Sheet." };

  revalidateCampaign(campaign.owned.campaign.id);
  return { ok: true as const, message: "Google Sheet disconnected." };
}

export async function syncSheetNow(campaignId: string) {
  const campaign = await ownedCampaign(campaignId);
  if ("error" in campaign) return campaign;

  const result = await syncCampaignNow(campaign.owned.supabase, campaign.owned.campaign.id);
  revalidateCampaign(campaign.owned.campaign.id);
  if (result.error) return { error: result.error };
  if (result.skipped || result.updated === 0) return { ok: true as const, message: "No leads are waiting to sync." };
  return { ok: true as const, message: `Synced ${result.updated} leads.` };
}

export async function resyncAllSheetRows(campaignId: string) {
  const campaign = await ownedCampaign(campaignId);
  if ("error" in campaign) return campaign;
  if (!campaign.owned.campaign.sheetId) return { error: "Connect a Google Sheet first." };

  const updated = await campaign.owned.supabase
    .from("leads")
    .update({ sheet_dirty: true }, { count: "exact" })
    .eq("campaign_id", campaign.owned.campaign.id);
  if (updated.error && isMissingColumn(updated.error)) return { error: migrationRequiredMessage };
  if (updated.error) return { error: "Could not mark leads for sync." };

  revalidateCampaign(campaign.owned.campaign.id);
  const count = updated.count ?? 0;
  return {
    ok: true as const,
    message:
      count > 0
        ? `Marked ${count} leads to sync again. Use Sync now to replace old call links.`
        : "There are no leads to sync.",
  };
}

export async function previewSheetImport(campaignId: string) {
  const campaign = await ownedCampaign(campaignId);
  if ("error" in campaign) return campaign;

  const connection = await campaign.owned.supabase
    .from("campaigns")
    .select("sheet_id, sheet_tab")
    .eq("id", campaign.owned.campaign.id)
    .maybeSingle();
  if (connection.error && isMissingColumn(connection.error)) return { error: migrationRequiredMessage };
  if (connection.error || !connection.data) return { error: "Could not load the Google Sheet." };
  const sheetId = (connection.data.sheet_id as string | null) ?? "";
  const tab =
    typeof connection.data.sheet_tab === "string" && connection.data.sheet_tab.trim()
      ? connection.data.sheet_tab.trim()
      : "Leads";
  if (!sheetId) return { error: "Connect a Google Sheet on the campaign page first." };

  const runtime = sheetsRuntime();
  if ("error" in runtime) return runtime;

  try {
    const api = createSheetsApi(runtime.env);
    await verifyAccess(api, sheetId, tab, runtime.env.email);
    const grid = await readRows(api, sheetId, tab);
    const layout = planHeaders(grid.headers);
    if (layout.nameIndex < 0 || layout.phoneIndex < 0) {
      return { error: "The sheet needs Name and Phone columns." };
    }
    const dataRows = grid.rows.map((row) => row.cells);
    const limit = importLimitError(0, dataRows.length);
    if (limit) return { error: limit.replace("This file", "This sheet") };
    const mapped = mapLeadRows(grid.headers, dataRows, layout.nameIndex, layout.phoneIndex);
    const phones = [
      ...new Set(
        mapped.flatMap((row) => {
          const phone = normalizePhone(row.rawPhone);
          return phone.ok ? [phone.e164] : [];
        }),
      ),
    ];
    const matches =
      phones.length > 0
        ? await findPhoneMatches(campaign.owned.supabase, campaign.owned.userId, campaign.owned.campaign.id, phones)
        : { existing: new Set<string>(), dnc: new Set<string>() };
    const preview = previewImport(mapped, matches.existing, matches.dnc);
    return {
      ok: true as const,
      counts: preview.counts,
      rows: preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => ({
        rowNumber: row.rowNumber,
        name: row.name,
        phone: row.phone ?? row.rawPhone,
        status: row.status,
        reason: row.reason,
      })),
      insertable: preview.rows.flatMap((row) =>
        row.status === "valid" && row.phone
          ? [{ name: row.name ?? "", phone: row.phone, extra: row.extra, sheetRow: row.rowNumber }]
          : [],
      ),
    };
  } catch (error) {
    return { error: sheetFailure(error, runtime.env.secrets) };
  }
}
