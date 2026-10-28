import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AddLeadForm } from "@/components/leads/add-lead-form";
import { ImportDialog } from "@/components/leads/import-dialog";
import { LeadsTable } from "@/components/leads/leads-table";
import { CampaignSectionNav } from "@/components/campaigns/campaign-section-nav";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { DeferredPage } from "@/components/deferred-page";
import { buttonVariants } from "@/components/ui/button";
import { LEADS_PAGE_SIZE, listLeads } from "@/lib/leads";
import { leadsHref } from "@/lib/leads/links";
import { SAMPLE_LEADS_CSV } from "@/lib/leads/csv";
import { leadStatusLabels, leadStatuses, parseLeadListQuery } from "@/lib/validation/leads";

export default function CampaignLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string; sort?: string }>;
}) {
  return (
    <DeferredPage>
      <CampaignLeadsContent params={params} searchParams={searchParams} />
    </DeferredPage>
  );
}

async function CampaignLeadsContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string; sort?: string }>;
}) {
  const [{ id }, queryInput] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const query = parseLeadListQuery(queryInput);
  const result = await listLeads(id, query);
  if (!result) notFound();

  const { campaign, leads, total, page, pageCount, counts } = result;
  const summary = [
    ["Total", counts.total],
    ["Pending", counts.pending],
    ["Interested", counts.interested],
    ["Callback", counts.callback],
    ["No answer", counts.no_answer],
    ["Do not call", counts.do_not_call],
    ["Failed", counts.failed],
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:underline">
          Back to campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
      </div>
      <CampaignSectionNav campaignId={campaign.id} current="leads" />
      {campaign.status === "active" ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This campaign is active. You can still import leads. They are saved as pending and are not called yet.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-xl border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={`/campaigns/${campaign.id}/leads`} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Search
            <input
              name="q"
              defaultValue={query.q}
              placeholder="Name or phone"
              className="h-10 rounded-lg border bg-background px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Status
            <select
              name="status"
              defaultValue={query.status ?? ""}
              className="h-10 rounded-lg border bg-background px-3"
            >
              <option value="">All</option>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>
                  {leadStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          {query.sort === "asc" ? <input type="hidden" name="sort" value="asc" /> : null}
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Apply
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <ImportDialog campaignId={campaign.id} active={campaign.status === "active"} />
          <a href={`/api/campaigns/${campaign.id}/leads/export`} className={buttonVariants({ variant: "outline" })}>
            Export CSV
          </a>
        </div>
      </div>
      <AddLeadForm campaignId={campaign.id} />
      {total === 0 && !query.q && !query.status ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="text-base font-medium">No leads yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Import a CSV or Excel file, or add one number.
          </p>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_LEADS_CSV)}`}
            download="sample-leads.csv"
            className={`${buttonVariants({ variant: "outline" })} mt-4`}
          >
            Download a sample CSV
          </a>
        </div>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads match this search.</p>
      ) : (
        <LeadsTable
          campaignId={campaign.id}
          leads={leads}
          createdSort={
            <Link
              href={leadsHref(campaign.id, query, {
                sort: query.sort === "asc" ? "desc" : "asc",
                page: 1,
              })}
              className="hover:underline"
            >
              Created {query.sort === "asc" ? "↑" : "↓"}
            </Link>
          }
        />
      )}
      {total > LEADS_PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {Math.min(page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={leadsHref(campaign.id, query, { page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link href={leadsHref(campaign.id, query, { page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
