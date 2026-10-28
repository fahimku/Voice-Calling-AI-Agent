import Link from "next/link";

import { DeferredPage } from "@/components/deferred-page";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCampaigns } from "@/lib/campaigns";
import { callLogHref, callOutcomeLabels, callOutcomes, callsPageSize, listCallLog, parseCallLogQuery } from "@/lib/calls/log";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; outcome?: string; from?: string; to?: string; kind?: string; page?: string }>;
}) {
  return (
    <DeferredPage>
      <CallsContent searchParams={searchParams} />
    </DeferredPage>
  );
}

async function CallsContent({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; outcome?: string; from?: string; to?: string; kind?: string; page?: string }>;
}) {
  const query = parseCallLogQuery(await searchParams);
  const [campaigns, log] = await Promise.all([listCampaigns(), listCallLog(query)]);
  const pageCount = log.ok ? Math.max(1, Math.ceil(log.total / callsPageSize)) : 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="text-sm text-muted-foreground">Dates use Asia/Dubai.</p>
      </div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <label className="flex flex-col gap-1 text-sm">
          Campaign
          <select name="campaign" defaultValue={query.campaign} className="h-10 rounded-lg border bg-background px-3">
            <option value="">All campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Outcome
          <select name="outcome" defaultValue={query.outcome} className="h-10 rounded-lg border bg-background px-3">
            <option value="">All outcomes</option>
            {callOutcomes.map((outcome) => (
              <option key={outcome} value={outcome}>
                {callOutcomeLabels[outcome]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input name="from" type="date" defaultValue={query.from} className="h-10 rounded-lg border bg-background px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input name="to" type="date" defaultValue={query.to} className="h-10 rounded-lg border bg-background px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Calls
          <select name="kind" defaultValue={query.kind} className="h-10 rounded-lg border bg-background px-3">
            <option value="all">Test and real</option>
            <option value="real">Real only</option>
            <option value="test">Test only</option>
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Apply filters
        </button>
      </form>
      {!log.ok ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{log.message}</p>
      ) : log.calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calls match these filters.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Attempt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  <Link href={`/calls/${call.id}`} className="hover:underline">
                    {formatDateTime(call.startedAt)}
                  </Link>
                </TableCell>
                <TableCell>{call.campaignName}</TableCell>
                <TableCell>{call.leadName ?? (call.isTest ? "Test call" : "—")}</TableCell>
                <TableCell>{call.maskedPhone}</TableCell>
                <TableCell className="capitalize">{call.status.replaceAll("_", " ")}</TableCell>
                <TableCell className="capitalize">{call.outcome?.replaceAll("_", " ") ?? "—"}</TableCell>
                <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                <TableCell>{call.attemptNumber ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {log.ok && log.total > callsPageSize ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {Math.min(query.page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {query.page > 1 ? (
              <Link href={callLogHref(query, { page: query.page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Previous
              </Link>
            ) : null}
            {query.page < pageCount ? (
              <Link href={callLogHref(query, { page: query.page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
