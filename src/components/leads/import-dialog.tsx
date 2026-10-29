"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { importLeads, matchImportPhones } from "@/app/(app)/campaigns/[id]/leads/actions";
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
import { SAMPLE_LEADS_CSV, toCsv } from "@/lib/leads/csv";
import { fileKind, parseCsvText, parseWorkbook } from "@/lib/leads/parse-file";
import {
  detectColumns,
  importLimitError,
  mapLeadRows,
  MAX_IMPORT_BYTES,
  previewImport,
  type ImportPreview,
  type PreviewStatus,
} from "@/lib/leads/preview";
import { normalizePhone } from "@/lib/phone/normalize";

const previewLabels: Record<PreviewStatus, string> = {
  valid: "Valid",
  invalid: "Invalid",
  duplicate_file: "Duplicate in file",
  duplicate_existing: "Already imported",
  dnc: "Do not call",
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportDialog({ campaignId, active }: { campaignId: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [nameIndex, setNameIndex] = useState(0);
  const [phoneIndex, setPhoneIndex] = useState(1);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  function reset() {
    setStep("upload");
    setError(null);
    setPending(false);
    setHeaders([]);
    setDataRows([]);
    setPreview(null);
    setResult(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const kind = fileKind(file.name);
    if (!kind) {
      setError("Use a CSV or Excel file.");
      return;
    }
    const tooLarge = importLimitError(file.size, 0);
    if (file.size > MAX_IMPORT_BYTES && tooLarge) {
      setError(tooLarge);
      return;
    }

    const parsed = kind === "csv" ? parseCsvText(await file.text()) : parseWorkbook(await file.arrayBuffer());
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    const detected = detectColumns(parsed.table.headers);
    setHeaders(parsed.table.headers);
    setDataRows(parsed.table.rows);
    setNameIndex(detected.nameIndex ?? 0);
    setPhoneIndex(detected.phoneIndex ?? Math.min(1, parsed.table.headers.length - 1));
    setStep("map");
  }

  async function buildPreview() {
    if (nameIndex === phoneIndex) {
      setError("Choose different columns for name and phone.");
      return;
    }
    setError(null);
    setPending(true);
    const mapped = mapLeadRows(headers, dataRows, nameIndex, phoneIndex);
    const phones = [
      ...new Set(
        mapped.flatMap((row) => {
          const phone = normalizePhone(row.rawPhone);
          return phone.ok ? [phone.e164] : [];
        }),
      ),
    ];
    const matches = phones.length > 0 ? await matchImportPhones(campaignId, phones) : { existing: [], dnc: [] };
    setPending(false);
    if (!("existing" in matches)) {
      setError(matches.error ?? "Could not check these numbers.");
      return;
    }
    setPreview(previewImport(mapped, new Set(matches.existing), new Set(matches.dnc)));
    setStep("preview");
  }

  async function confirmImport() {
    if (!preview || preview.insertable.length === 0) return;
    setPending(true);
    setError(null);
    const response = await importLeads(
      campaignId,
      preview.insertable.map((row) => ({
        name: row.name ?? "",
        phone: row.rawPhone,
        extra: row.extra,
      })),
    );
    setPending(false);
    if (response.error && !response.ok) {
      setError(response.error);
      toast.error(response.error, { id: response.error });
      return;
    }
    setResult({ inserted: response.inserted ?? 0, skipped: response.skipped ?? 0 });
    setStep("done");
    toast.success(
      response.reopened
        ? `Imported ${response.inserted ?? 0} leads. This completed campaign is paused again.`
        : `Imported ${response.inserted ?? 0} leads.`,
      { id: "leads-imported" },
    );
    router.refresh();
  }

  const counts = preview?.counts;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>Import</DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>CSV or Excel, up to 5 MB and 5,000 rows.</DialogDescription>
        </DialogHeader>
        {active ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            This campaign is active. Imported leads are saved as pending and are not called yet.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {step === "upload" ? (
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void onFile(event.target.files?.[0])}
              className="text-sm"
            />
            <button
              type="button"
              className="w-fit text-sm font-medium underline-offset-4 hover:underline"
              onClick={() => downloadText("sample-leads.csv", SAMPLE_LEADS_CSV)}
            >
              Download a sample CSV
            </button>
          </div>
        ) : null}

        {step === "map" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name column
              <select
                value={nameIndex}
                onChange={(event) => setNameIndex(Number(event.target.value))}
                className="h-10 rounded-lg border bg-background px-3"
              >
                {headers.map((header, index) => (
                  <option key={`name-${index}`} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Phone column
              <select
                value={phoneIndex}
                onChange={(event) => setPhoneIndex(Number(event.target.value))}
                className="h-10 rounded-lg border bg-background px-3"
              >
                {headers.map((header, index) => (
                  <option key={`phone-${index}`} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === "preview" && preview && counts ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <Count label="Valid" value={counts.valid} />
              <Count label="Invalid" value={counts.invalid} />
              <Count label="In file" value={counts.duplicateFile} />
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
                  <TableCell>{row.phone ?? row.rawPhone}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "valid" ? "default" : "outline"}>{previewLabels[row.status]}</Badge>
                  </TableCell>
                  <TableCell>{row.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            />
            {counts.invalid > 0 ? (
              <button
                type="button"
                className="w-fit text-sm font-medium underline-offset-4 hover:underline"
                onClick={() =>
                  downloadText(
                    "invalid-leads.csv",
                    toCsv(
                      ["Row", "Name", "Phone", "Reason"],
                      preview.rows
                        .filter((row) => row.status === "invalid")
                        .map((row) => [row.rowNumber, row.rawName, row.rawPhone, row.reason]),
                    ),
                  )
                }
              >
                Download invalid rows
              </button>
            ) : null}
          </div>
        ) : null}

        {step === "done" && result ? (
          <p className="text-sm">
            Inserted {result.inserted}. Skipped {result.skipped}.
          </p>
        ) : null}

        <DialogFooter>
          {step === "map" ? (
            <Button type="button" onClick={() => void buildPreview()} disabled={pending}>
              {pending ? "Checking…" : "Preview"}
            </Button>
          ) : null}
          {step === "preview" ? (
            <Button
              type="button"
              onClick={() => void confirmImport()}
              disabled={pending || (preview?.insertable.length ?? 0) === 0}
            >
              {pending ? "Importing…" : `Import ${preview?.insertable.length ?? 0} leads`}
            </Button>
          ) : null}
          {step === "done" ? (
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
