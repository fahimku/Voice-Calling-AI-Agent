"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { importDncNumbers, previewDncCsv } from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PagedTable } from "@/components/ui/paged-table";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { collectDncCells, type DncPreviewStatus } from "@/lib/dnc/preview";
import { parseCsvText } from "@/lib/leads/parse-file";
import { MAX_IMPORT_BYTES } from "@/lib/leads/preview";

const labels: Record<DncPreviewStatus, string> = {
  valid: "Valid",
  invalid: "Invalid",
  duplicate_file: "Duplicate in file",
  duplicate_existing: "Already listed",
};

type PreviewState = {
  counts: { valid: number; invalid: number; duplicateFile: number; duplicateExisting: number };
  rows: { rowNumber: number; raw: string; phone: string | null; status: DncPreviewStatus; reason: string | null }[];
  insertable: string[];
};

export function DncImport() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"preview" | "import" | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Use a CSV file.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError("This file is larger than 5 MB.");
      return;
    }

    const parsed = parseCsvText(await file.text());
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    const cells = collectDncCells(parsed.table.headers, parsed.table.rows);
    if ("error" in cells) {
      setError(cells.error);
      return;
    }

    setPending("preview");
    toast.loading("Checking numbers…", { id: "dnc-preview" });
    const result = await previewDncCsv(cells.cells.map((cell) => cell.raw));
    setPending(null);
    toast.dismiss("dnc-preview");
    if (!("ok" in result) || !result.ok) {
      setError("error" in result && result.error ? result.error : "Could not preview this file.");
      return;
    }
    setPreview({ counts: result.counts, rows: result.rows, insertable: result.insertable });
  }

  async function confirm() {
    if (!preview || preview.insertable.length === 0) return;
    setPending("import");
    setError(null);
    toast.loading("Importing numbers…", { id: "dnc-import" });
    const result = await importDncNumbers(preview.insertable);
    setPending(null);
    if (!("ok" in result) || !result.ok) {
      const message = "error" in result && result.error ? result.error : "Could not import these numbers.";
      setError(message);
      toast.error(message, { id: "dnc-import" });
      return;
    }
    toast.success(`Imported ${result.inserted ?? 0} do-not-call numbers.`, { id: "dnc-imported" });
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="dnc-csv" className="text-sm font-medium">
        Import a CSV
        <input
          id="dnc-csv"
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm font-normal"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        Use a Phone column, or one column of numbers. Invalid numbers are skipped and the reason is shown per row.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pending === "preview" ? <p className="text-sm text-muted-foreground">Checking numbers…</p> : null}
      {preview ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Count label="Valid" value={preview.counts.valid} />
            <Count label="Invalid" value={preview.counts.invalid} />
            <Count label="Duplicate in file" value={preview.counts.duplicateFile} />
            <Count label="Already listed" value={preview.counts.duplicateExisting} />
          </dl>
          <PagedTable
            header={
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            }
            rows={preview.rows.map((row) => (
              <TableRow key={`${row.rowNumber}-${row.raw}`}>
                <TableCell>{row.rowNumber}</TableCell>
                <TableCell>{row.phone ?? row.raw}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "valid" ? "default" : "outline"}>{labels[row.status]}</Badge>
                </TableCell>
                <TableCell>{row.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          />
          <Button type="button" disabled={pending !== null || preview.insertable.length === 0} onClick={() => void confirm()}>
            {pending === "import" ? "Importing…" : `Import ${preview.insertable.length} numbers`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
