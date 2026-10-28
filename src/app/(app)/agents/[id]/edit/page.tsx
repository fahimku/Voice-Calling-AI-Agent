import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { updateAgent } from "@/app/(app)/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import { DeleteAgentButton } from "@/components/agents/delete-agent-button";
import { DeferredPage } from "@/components/deferred-page";
import { getAgent } from "@/lib/agents";
import { variableEntries } from "@/lib/validation/agents";

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <DeferredPage>
      <EditAgentContent params={params} />
    </DeferredPage>
  );
}

async function EditAgentContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const agent = await getAgent(id);
  if (!agent) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/agents" className="text-sm text-muted-foreground hover:underline">
            Back to agents
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit agent</h1>
        </div>
        <DeleteAgentButton id={agent.id} name={agent.name} />
      </div>
      <AgentForm
        action={updateAgent.bind(null, agent.id)}
        submitLabel="Save changes"
        values={{
          name: agent.name,
          businessType: agent.business_type,
          providerAssistantId: agent.provider_assistant_id,
          providerPhoneNumberId: agent.provider_phone_number_id ?? "",
          notes: agent.notes ?? "",
          agentDisplayName: agent.agent_display_name ?? "",
          businessName: agent.business_name ?? "",
          variables: variableEntries(agent.variables),
        }}
      />
    </div>
  );
}
