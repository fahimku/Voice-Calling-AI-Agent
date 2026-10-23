import Link from "next/link";

import { createCampaign } from "@/app/(app)/campaigns/actions";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { DeferredPage } from "@/components/deferred-page";
import { listAgents } from "@/lib/agents";

export default function NewCampaignPage() {
  return (
    <DeferredPage>
      <NewCampaignContent />
    </DeferredPage>
  );
}

async function NewCampaignContent() {
  const agents = await listAgents();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:underline">
          Back to campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create campaign</h1>
      </div>
      <CampaignForm
        action={createCampaign}
        submitLabel="Create campaign"
        agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
      />
    </div>
  );
}
