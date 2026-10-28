"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectSheet,
  resyncAllSheetRows,
  saveSheetConnection,
  syncSheetNow,
  testSheetConnection,
} from "@/app/(app)/campaigns/sheet-actions";
import { SheetImportButton } from "@/components/leads/sheet-import-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { SheetSettings } from "@/lib/sheets/settings-types";

export function SheetCard({
  campaignId,
  active,
  settings,
}: {
  campaignId: string;
  active: boolean;
  settings: SheetSettings;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState(settings.sheetInput);
  const [tab, setTab] = useState(settings.tab);
  const [pending, setPending] = useState<"save" | "test" | "sync" | "disconnect" | "resync" | null>(null);

  async function run(
    action: "save" | "test" | "sync" | "disconnect" | "resync",
    task: () => Promise<{ error?: string; message?: string }>,
  ) {
    setPending(action);
    const result = await task();
    setPending(null);
    if (result.error) {
      toast.error(result.error, { id: "sheet-error" });
      router.refresh();
      return;
    }
    if (result.message) toast.success(result.message, { id: "sheet-result" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Sheet</CardTitle>
        <CardDescription>
          Import leads from the sheet, then write call results back. Share the sheet with the service account as Editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          Service account:{" "}
          <span className="font-medium">{settings.email || "Not configured"}</span>
        </p>
        {settings.migrationRequired ? (
          <p className="text-sm text-muted-foreground">
            The latest database migration is not applied yet. Run supabase db push, then try again.
          </p>
        ) : null}
        {settings.configured ? null : (
          <p className="text-sm text-muted-foreground">
            Add the Google service account email and private key, then restart the app.
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Sheet link or ID
          <input
            value={sheet}
            onChange={(event) => setSheet(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="h-10 rounded-lg border bg-background px-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tab name
          <input
            value={tab}
            onChange={(event) => setTab(event.target.value)}
            placeholder="Leads"
            className="h-10 rounded-lg border bg-background px-3 font-normal"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void run("test", () => testSheetConnection(campaignId, sheet, tab))}
          >
            {pending === "test" ? "Testing…" : "Test connection"}
          </Button>
          <Button
            type="button"
            disabled={pending !== null || settings.migrationRequired}
            onClick={() => void run("save", () => saveSheetConnection(campaignId, sheet, tab))}
          >
            {pending === "save" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !settings.connected}
            onClick={() => void run("disconnect", () => disconnectSheet(campaignId))}
          >
            {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !settings.connected}
            onClick={() => void run("sync", () => syncSheetNow(campaignId))}
          >
            {pending === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !settings.connected}
            onClick={() => void run("resync", () => resyncAllSheetRows(campaignId))}
          >
            {pending === "resync" ? "Marking…" : "Re-sync all rows"}
          </Button>
          <SheetImportButton campaignId={campaignId} active={active} />
        </div>
        <p className="text-sm text-muted-foreground">
          Last synced: {settings.lastSyncedAt ? formatDateTime(settings.lastSyncedAt) : "Not yet"}. After the site URL
          changes, use Re-sync all rows, then Sync now, so call links are rewritten.
        </p>
        {settings.lastError ? <p className="text-sm text-destructive">{settings.lastError}</p> : null}
      </CardContent>
    </Card>
  );
}
