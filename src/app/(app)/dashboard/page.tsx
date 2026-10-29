import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

import { CallsChart } from "@/components/dashboard/calls-chart";
import { FunnelBars } from "@/components/dashboard/funnel-bars";
import { PauseAllButton } from "@/components/dashboard/pause-all-button";
import { DeferredPage } from "@/components/deferred-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PagedTable } from "@/components/ui/paged-table";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { formatUsd } from "@/lib/dashboard/aggregate";
import { loadDashboard, migrationNotice } from "@/lib/dashboard/load";
import { requireUser } from "@/lib/auth";
import { callOutcomeLabels } from "@/lib/calls/log";
import { formatDateTime } from "@/lib/format";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  return (
    <DeferredPage>
      <DashboardContent searchParams={searchParams} />
    </DeferredPage>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const params = await searchParams;
  const requested = z.uuid().safeParse(params.campaign).success ? params.campaign ?? "" : "";
  const { supabase, userId } = await requireUser();
  const data = await loadDashboard(supabase, userId, requested);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Today’s calling, outcomes, and anything that needs a look.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings/go-live" className="text-sm hover:underline">
            Go-live checklist
          </Link>
          <PauseAllButton />
        </div>
      </div>

      {data.migrationRequired ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{migrationNotice()}</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Calls today" value={`${data.usage.callsToday} / ${data.usage.dailyLimit}`} hint="Used / daily limits" />
        <Stat label="Interested this week" value={String(data.usage.interestedThisWeek)} hint="Asia/Dubai week" />
        <Stat label="Callbacks due" value={String(data.usage.callbacksDue)} hint="Due now" />
        <Stat label="Calls this month" value={String(data.usage.callsThisMonth)} hint="Asia/Dubai month" />
        <Stat
          label="Estimated cost"
          value={formatUsd(data.usage.costThisMonth)}
          hint={
            data.usage.mockCostThisMonth > 0
              ? `${formatUsd(data.usage.mockCostThisMonth)} is marked as mock`
              : "This month"
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Calls by outcome</CardTitle>
          <CardDescription>Last 14 days, Asia/Dubai.</CardDescription>
        </CardHeader>
        <CardContent>
          <CallsChart series={data.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>Leads, calls, answers, and interest for one campaign.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No campaigns yet. <Link href="/campaigns/new" className="hover:underline">Create one</Link> to see a funnel.
              </p>
            ) : (
              <form>
                <label htmlFor="campaign" className="mb-1 block text-sm font-medium">
                  Campaign
                </label>
                <select
                  id="campaign"
                  name="campaign"
                  defaultValue={data.selectedCampaignId}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  {data.campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="mt-2 text-sm hover:underline">
                  Show funnel
                </button>
              </form>
            )}
            {data.selectedCampaignId ? <FunnelBars counts={data.funnel} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Sheet errors, failed calls, closed windows, and due callbacks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <AttentionGroup title="Sheet sync errors" empty="No sheet sync errors.">
              {data.attention.sheetErrors.map((item) => (
                <li key={item.id}>
                  <Link href={`/campaigns/${item.id}`} className="hover:underline">
                    {item.name}
                  </Link>
                  <span className="text-muted-foreground"> — {item.error}</span>
                </li>
              ))}
            </AttentionGroup>
            <AttentionGroup title="Failed calls, last 24 hours" empty="No failed calls in the last 24 hours.">
              {data.attention.failedCalls.map((item) => (
                <li key={item.id}>
                  <Link href={`/calls/${item.id}`} className="hover:underline">
                    {item.campaignName}
                  </Link>
                  <span className="text-muted-foreground"> — {formatDateTime(item.startedAt)}</span>
                </li>
              ))}
            </AttentionGroup>
            <AttentionGroup title="Active outside the call window" empty="Every active campaign is inside its window.">
              {data.attention.outsideWindow.map((item) => (
                <li key={item.id}>
                  <Link href={`/campaigns/${item.id}`} className="hover:underline">
                    {item.name}
                  </Link>
                  <span className="text-muted-foreground"> — {item.reason}</span>
                </li>
              ))}
            </AttentionGroup>
            <AttentionGroup title="Callbacks due" empty="No callbacks are due.">
              {data.attention.callbacks.map((item) => (
                <li key={item.id}>
                  {item.name} · {item.campaignName}
                  <span className="text-muted-foreground"> — {formatDateTime(item.callbackAt)}</span>
                </li>
              ))}
            </AttentionGroup>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 10 calls</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls yet.</p>
          ) : (
            <PagedTable
              header={
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              }
              rows={data.recent.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      <Link href={`/calls/${call.id}`} className="hover:underline">
                        {formatDateTime(call.startedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>{call.campaignName}</TableCell>
                    <TableCell>{call.leadName ?? call.maskedPhone}</TableCell>
                    <TableCell>
                      {call.outcome && call.outcome in callOutcomeLabels
                        ? callOutcomeLabels[call.outcome as keyof typeof callOutcomeLabels]
                        : (call.outcome ?? "—")}
                    </TableCell>
                    <TableCell>
                      {call.costUsd == null ? "—" : formatUsd(call.costUsd)}
                      {call.costIsMock ? " mock" : ""}
                    </TableCell>
                  </TableRow>
              ))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function AttentionGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const visible = items.filter(Boolean);
  return (
    <section>
      <h2 className="mb-1 font-medium">{title}</h2>
      {visible.length === 0 ? <p className="text-muted-foreground">{empty}</p> : <ul className="flex flex-col gap-1">{children}</ul>}
    </section>
  );
}
