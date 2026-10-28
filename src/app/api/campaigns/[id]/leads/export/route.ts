import { z } from "zod";

import { listLeadsForExport } from "@/lib/leads";
import { toCsv } from "@/lib/leads/csv";
import { leadStatusLabels } from "@/lib/validation/leads";
import { formatDateTime } from "@/lib/format";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return new Response("Not found", { status: 404 });
  }

  const result = await listLeadsForExport(id);
  if (!result) return new Response("Not found", { status: 404 });

  const csv = toCsv(
    ["Name", "Phone", "Status", "Interest level", "Attempts", "Last call", "Summary"],
    result.leads.map((lead) => [
      lead.name ?? "",
      lead.phone_e164,
      leadStatusLabels[lead.status],
      lead.interest_level ?? "",
      lead.attempts,
      lead.last_call_at ? formatDateTime(lead.last_call_at) : "",
      lead.summary ?? "",
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${result.campaign.name.replace(/[^\w.-]+/g, "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
