import type { LeadListQuery } from "@/lib/leads";

export function leadsHref(campaignId: string, query: LeadListQuery, patch: Partial<LeadListQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.sort === "asc") params.set("sort", "asc");
  const search = params.toString();
  return `/campaigns/${campaignId}/leads${search ? `?${search}` : ""}`;
}
