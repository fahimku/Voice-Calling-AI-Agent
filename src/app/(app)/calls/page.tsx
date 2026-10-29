import Link from "next/link";

import { DeferredPage } from "@/components/deferred-page";
import { dateControlClass, fieldControlClass, filterLabelClass } from "@/components/form-controls";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePager } from "@/components/ui/table-pager";
import { listCampaigns } from "@/lib/campaigns";
import { callLogHref, callOutcomeLabels, callOutcomes, listCallLog, parseCallLogQuery } from "@/lib/calls/log";
import { pagerLinkSet, sizeLinkSet } from "@/lib/table-page";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; outcome?: string; from?: string; to?: string; kind?: string; page?: string; per?: string }>;
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
  searchParams: Promise<{ campaign?: string; outcome?: string; from?: string; to?: string; kind?: string; page?: string; per?: string }>;
}) {
  const query = parseCallLogQuery(await searchParams);
  const [campaigns, log] = await Promise.all([listCampaigns(), listCallLog(query)]);
  const pageCount = log.ok ? Math.max(1, Math.ceil(log.total / query.pageSize)) : 1;
  const currentPage = Math.min(query.page, pageCount);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="text-sm text-muted-foreground">Dates use Asia/Dubai.</p>
      </div>
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <label className={filterLabelClass}>
          Campaign
          <select name="campaign" defaultValue={query.campaign} className={fieldControlClass}>
            <option value="">All campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <label className={filterLabelClass}>
          Outcome
          <select name="outcome" defaultValue={query.outcome} className={fieldControlClass}>
            <option value="">All outcomes</option>
            {callOutcomes.map((outcome) => (
              <option key={outcome} value={outcome}>
                {callOutcomeLabels[outcome]}
              </option>
            ))}
          </select>
        </label>
        <label className={filterLabelClass}>
          From
          <input name="from" type="date" defaultValue={query.from} className={dateControlClass} />
        </label>
        <label className={filterLabelClass}>
          To
          <input name="to" type="date" defaultValue={query.to} className={dateControlClass} />
        </label>
        <label className={filterLabelClass}>
          Calls
          <select name="kind" defaultValue={query.kind} className={fieldControlClass}>
            <option value="all">Test and real</option>
            <option value="real">Real only</option>
            <option value="test">Test only</option>
          </select>
        </label>
        {query.pageSize !== 10 ? <input type="hidden" name="per" value={query.pageSize} /> : null}
        <div className="flex items-end">
          <button type="submit" className={`${buttonVariants({ variant: "default" })} h-10 px-4`}>
            Apply filters
          </button>
        </div>
      </form>
      {!log.ok ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{log.message}</p>
      ) : log.calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calls match these filters.</p>
      ) : (
        <Table
          footer={
            <TablePager
              page={currentPage}
              pageSize={query.pageSize}
              total={log.total}
              pageCount={pageCount}
              {...pagerLinkSet(currentPage, pageCount, (page) => callLogHref(query, { page }))}
              sizeHrefs={sizeLinkSet((pageSize) => callLogHref(query, { page: 1, pageSize }))}
            />
          }
        >
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
    </div>
  );
}
