import Link from "next/link";

import { createAgent } from "@/app/(app)/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";

export default function NewAgentPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/agents" className="text-sm text-muted-foreground hover:underline">
          Back to agents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create agent</h1>
      </div>
      <AgentForm action={createAgent} submitLabel="Create agent" />
    </div>
  );
}
