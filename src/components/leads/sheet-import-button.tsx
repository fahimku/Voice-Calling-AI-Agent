"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { previewSheetImport } from "@/app/(app)/campaigns/sheet-actions";
import { importLeads } from "@/app/(app)/campaigns/[id]/leads/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PagedTable } from "@/components/ui/paged-table";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Preview = Awaited<ReturnType<typeof previewSheetImport>>;

const previewLabels = {
  valid: "Valid",
  invalid: "Invalid",
  duplicate_file: "Duplicate in sheet",
  duplicate_existing: "Already imported",
  dnc: "Do not call",
} as const;

export function SheetImportButton({ campaignId, active }: { campaignId: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<Preview, { ok: true }> | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  async function load() {
    setPending(true);
    setError(null);
    setDone(null);
    const result = await previewSheetImport(campaignId);
    setPending(false);
    if (!("ok" in result) || !result.ok) {
      setPreview(null);
      setError("error" in result ? (result.error ?? "Could not read the sheet.") : "Could not read the sheet.");
      return;
    }
    setPreview(result);
  }

  async function confirmImport() {
    if (!preview || preview.insertable.length === 0) return;
    setPending(true);
    setError(null);
    const response = await importLeads(campaignId, preview.insertable);
    setPending(false);
    if (response.error && !response.ok) {
      setError(response.error);
      toast.error(response.error, { id: "sheet-import-error" });
      return;
    }
    setDone({ inserted: response.inserted ?? 0, skipped: response.skipped ?? 0 });
    toast.success(
      response.reopened
        ? `Imported ${response.inserted ?? 0} leads. This completed campaign is paused again.`
        : `Imported ${response.inserted ?? 0} leads.`,
      { id: "sheet-imported" },
    );
    router.refresh();
  }

  const counts = preview?.counts;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
        if (!next) {
          setError(null);
          setPreview(null);
          setDone(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>Import from sheet</DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Google Sheet</DialogTitle>
          <DialogDescription>
            Name and phone come from the connected sheet. Numbers already in this campaign are skipped.
          </DialogDescription>
        </DialogHeader>
        {active ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            This campaign is active. Imported leads are saved as pending and are not called yet.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {pending && !preview ? <p className="text-sm text-muted-foreground">Reading the sheet…</p> : null}
        {preview && counts ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <Count label="Valid" value={counts.valid} />
              <Count label="Invalid" value={counts.invalid} />
              <Count label="In sheet" value={counts.duplicateFile} />
              <Count label="Existing" value={counts.duplicateExisting} />
              <Count label="DNC" value={counts.dnc} />
            </dl>
            <PagedTable
              header={
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              }
              rows={preview.rows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>{row.name ?? "—"}</TableCell>
                  <TableCell>{row.phone}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "valid" ? "default" : "outline"}>{previewLabels[row.status]}</Badge>
                  </TableCell>
                  <TableCell>{row.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            />
          </div>
        ) : null}
        {done ? (
          <p className="text-sm">
            Inserted {done.inserted}. Skipped {done.skipped}.
          </p>
        ) : null}
        <DialogFooter>
          {preview && !done ? (
            <Button type="button" onClick={() => void confirmImport()} disabled={pending || preview.insertable.length === 0}>
              {pending ? "Importing…" : `Import ${preview.insertable.length} leads`}
            </Button>
          ) : null}
          {done ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-2 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
