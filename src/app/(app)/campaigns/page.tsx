import Link from "next/link";

import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { DeferredPage } from "@/components/deferred-page";
import { FlashNotice } from "@/components/flash-notice";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCampaigns } from "@/lib/campaigns";
import { formatActiveDays, formatCreated, formatWindow } from "@/lib/format";

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <DeferredPage>
      <CampaignsContent searchParams={searchParams} />
    </DeferredPage>
  );
}

async function CampaignsContent({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ notice }, campaigns] = await Promise.all([searchParams, listCampaigns()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <FlashNotice notice={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">One agent, one schedule, one daily limit.</p>
        </div>
        <Link href="/campaigns/new" className={buttonVariants()}>
          Create campaign
        </Link>
      </div>
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="text-base font-medium">No campaigns yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect an agent, then set the hours and daily limit.
          </p>
          <Link href="/campaigns/new" className={`${buttonVariants()} mt-4`}>
            Create campaign
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Daily limit</TableHead>
              <TableHead>Call window</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="font-medium">
                  <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
                    {campaign.name}
                  </Link>
                </TableCell>
                <TableCell>{campaign.agent_name}</TableCell>
                <TableCell>
                  <StatusBadge status={campaign.status} />
                </TableCell>
                <TableCell>{campaign.daily_limit}</TableCell>
                <TableCell>
                  {formatWindow(campaign.window_start, campaign.window_end)}
                  <span className="block text-xs text-muted-foreground">
                    {formatActiveDays(campaign.active_days)}
                  </span>
                </TableCell>
                <TableCell>{formatCreated(campaign.created_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open
                    </Link>
                    <DeleteCampaignButton id={campaign.id} name={campaign.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
