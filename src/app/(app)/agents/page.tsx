import Link from "next/link";

import { DeleteAgentButton } from "@/components/agents/delete-agent-button";
import { DeferredPage } from "@/components/deferred-page";
import { FlashNotice } from "@/components/flash-notice";
import { buttonVariants } from "@/components/ui/button";
import { PagedTable } from "@/components/ui/paged-table";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { listAgents } from "@/lib/agents";
import { formatCreated, shortenId } from "@/lib/format";
import { businessTypeLabels } from "@/lib/validation/agents";

export default function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <DeferredPage>
      <AgentsContent searchParams={searchParams} />
    </DeferredPage>
  );
}

async function AgentsContent({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ notice }, agents] = await Promise.all([searchParams, listAgents()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <FlashNotice notice={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Voice agents used by your campaigns.</p>
        </div>
        <Link href="/agents/new" className={buttonVariants()}>
          Create agent
        </Link>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="text-base font-medium">No agents yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a Vapi assistant ID to place calls later.
          </p>
          <Link href="/agents/new" className={`${buttonVariants()} mt-4`}>
            Create agent
          </Link>
        </div>
      ) : (
        <PagedTable
          header={
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Business type</TableHead>
              <TableHead>Assistant ID</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          }
          rows={agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">{agent.name}</TableCell>
                <TableCell>{businessTypeLabels[agent.business_type]}</TableCell>
                <TableCell title={agent.provider_assistant_id}>
                  {shortenId(agent.provider_assistant_id)}
                </TableCell>
                <TableCell>{formatCreated(agent.created_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Link href={`/agents/${agent.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Edit
                    </Link>
                    <DeleteAgentButton id={agent.id} name={agent.name} />
                  </div>
                </TableCell>
              </TableRow>
          ))}
        />
      )}
    </div>
  );
}
