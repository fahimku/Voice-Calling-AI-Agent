import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CampaignSectionNav } from "@/components/campaigns/campaign-section-nav";
import { DeferredPage } from "@/components/deferred-page";
import { buttonVariants } from "@/components/ui/button";
import { PagedTable } from "@/components/ui/paged-table";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { listCampaignCalls } from "@/lib/calls";
import { getCampaign } from "@/lib/campaigns";
import { formatDateTime } from "@/lib/format";

export default function CampaignCallsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DeferredPage>
      <CampaignCallsContent params={params} />
    </DeferredPage>
  );
}

async function CampaignCallsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const calls = await listCampaignCalls(id);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:underline">
          Back to campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{campaign.name}</h1>
      </div>
      <CampaignSectionNav campaignId={campaign.id} current="calls" />
      {!calls.ok ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{calls.message}</p>
      ) : calls.calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No campaign calls yet.</p>
      ) : (
        <PagedTable
          header={
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Attempt</TableHead>
            </TableRow>
          }
          rows={calls.calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  <Link href={`/calls/${call.id}`} className="hover:underline">
                    {formatDateTime(call.startedAt)}
                  </Link>
                </TableCell>
                <TableCell>{call.maskedPhone}</TableCell>
                <TableCell className="capitalize">{call.status.replaceAll("_", " ")}</TableCell>
                <TableCell className="capitalize">{call.outcome?.replaceAll("_", " ") ?? "—"}</TableCell>
                <TableCell>{call.attemptNumber ?? "—"}</TableCell>
              </TableRow>
          ))}
        />
      )}
      <Link href={`/campaigns/${campaign.id}`} className={buttonVariants({ variant: "outline" })}>
        Back to settings
      </Link>
    </div>
  );
}
