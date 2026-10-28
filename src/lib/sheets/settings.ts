import "server-only";

import { requireUser } from "@/lib/auth";
import { isMissingColumn } from "@/lib/db-error";
import { readSheetRuntime } from "@/lib/sheets/env";
import type { SheetSettings } from "@/lib/sheets/settings-types";

export type { SheetSettings };

export async function getSheetSettings(campaignId: string): Promise<SheetSettings | null> {
  const { supabase, userId } = await requireUser();
  const base = await supabase
    .from("campaigns")
    .select("sheet_id")
    .eq("id", campaignId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (base.error || !base.data) return null;

  const extra = await supabase
    .from("campaigns")
    .select("sheet_tab, sheet_last_synced_at, sheet_last_error")
    .eq("id", campaignId)
    .eq("owner_id", userId)
    .maybeSingle();
  const migrationRequired = Boolean(extra.error && isMissingColumn(extra.error));
  if (extra.error && !migrationRequired) throw new Error("Could not load the Google Sheet settings.");

  const runtime = readSheetRuntime();
  const sheetId = (base.data.sheet_id as string | null) ?? "";
  return {
    migrationRequired,
    email: runtime.email,
    configured: Boolean(runtime.email && runtime.privateKey),
    sheetInput: sheetId,
    tab: !migrationRequired && typeof extra.data?.sheet_tab === "string" && extra.data.sheet_tab.trim()
      ? extra.data.sheet_tab
      : "Leads",
    connected: Boolean(sheetId),
    lastSyncedAt: migrationRequired ? null : ((extra.data?.sheet_last_synced_at as string | null) ?? null),
    lastError: migrationRequired ? null : ((extra.data?.sheet_last_error as string | null) ?? null),
  };
}
