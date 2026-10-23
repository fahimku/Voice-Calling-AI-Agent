import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { updateCampaign } from "@/app/(app)/campaigns/actions";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { DeferredPage } from "@/components/deferred-page";
import { listAgents } from "@/lib/agents";
import { getCampaign } from "@/lib/campaigns";
import { formatTimeInput } from "@/lib/format";

export default function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <DeferredPage>
      <EditCampaignContent params={params} />
    </DeferredPage>
  );
}

async function EditCampaignContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [campaign, agents] = await Promise.all([getCampaign(id), listAgents()]);
  if (!campaign) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Back to campaign
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit campaign</h1>
      </div>
      <CampaignForm
        action={updateCampaign.bind(null, campaign.id)}
        submitLabel="Save changes"
        agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
        values={{
          name: campaign.name,
          agentId: campaign.agent_id,
          timezone: campaign.timezone,
          dailyLimit: campaign.daily_limit,
          windowStart: formatTimeInput(campaign.window_start),
          windowEnd: formatTimeInput(campaign.window_end),
          activeDays: campaign.active_days,
          maxConcurrent: campaign.max_concurrent,
          maxAttempts: campaign.max_attempts,
          retryDelayMinutes: campaign.retry_delay_minutes,
          countRetriesInLimit: campaign.count_retries_in_limit,
        }}
      />
    </div>
  );
}
