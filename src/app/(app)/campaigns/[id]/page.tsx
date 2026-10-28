import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CampaignSectionNav } from "@/components/campaigns/campaign-section-nav";
import { TestCallCard } from "@/components/campaigns/test-call-card";
import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { StatusActions } from "@/components/campaigns/status-actions";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { DeferredPage } from "@/components/deferred-page";
import { FlashNotice } from "@/components/flash-notice";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTestCallSection } from "@/lib/calls";
import { getCampaign } from "@/lib/campaigns";
import {
  formatActiveDays,
  formatCreated,
  formatTimeInput,
  formatWindow,
} from "@/lib/format";
import { voiceProviderMode } from "@/lib/providers/mode";
import { campaignCanStart } from "@/lib/validation/campaigns";

export default function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <DeferredPage>
      <CampaignDetailContent params={params} searchParams={searchParams} />
    </DeferredPage>
  );
}

async function CampaignDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [campaign, testCalls] = await Promise.all([getCampaign(id), getTestCallSection(id)]);
  if (!campaign) notFound();
  const mockMode = voiceProviderMode() === "mock";

  const startBlocker = campaignCanStart({
    agentId: campaign.agent_id,
    dailyLimit: campaign.daily_limit,
    windowStart: campaign.window_start,
    windowEnd: campaign.window_end,
  });

  const settings = [
    ["Agent", campaign.agent_name],
    ["Timezone", campaign.timezone],
    ["Daily limit", String(campaign.daily_limit)],
    ["Call window", `${formatWindow(campaign.window_start, campaign.window_end)} · ${formatActiveDays(campaign.active_days)}`],
    ["Max concurrent", String(campaign.max_concurrent)],
    ["Max attempts", String(campaign.max_attempts)],
    ["Retry delay", `${campaign.retry_delay_minutes} minutes`],
    ["Retries count toward the limit", campaign.count_retries_in_limit ? "Yes" : "No"],
    ["Created", formatCreated(campaign.created_at)],
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <FlashNotice notice={notice} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/campaigns" className="text-sm text-muted-foreground hover:underline">
            Back to campaigns
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            Edit
          </Link>
          <DeleteCampaignButton id={campaign.id} name={campaign.name} />
        </div>
      </div>
      <CampaignSectionNav campaignId={campaign.id} current="settings" />
      <StatusActions
        campaignId={campaign.id}
        status={campaign.status}
        startBlocker={startBlocker}
      />
      <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        {settings.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s calls used / limit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming in the next phases. The daily limit is {campaign.daily_limit}, from{" "}
              {formatTimeInput(campaign.window_start)} to {formatTimeInput(campaign.window_end)}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Import a list, add a number, or export the leads in this campaign.
            </p>
            <Link href={`/campaigns/${campaign.id}/leads`} className={buttonVariants({ variant: "outline" })}>
              Open leads
            </Link>
          </CardContent>
        </Card>
      </div>
      {testCalls.ok ? (
        <TestCallCard
          campaignId={campaign.id}
          mockMode={mockMode}
          needsPhoneNumber={!mockMode && !testCalls.agent.providerPhoneNumberId}
          calls={testCalls.calls}
        />
      ) : (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{testCalls.message}</p>
      )}
    </div>
  );
}
