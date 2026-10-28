"use client";

import { useState } from "react";

import { DeleteLeadButton } from "@/components/leads/delete-lead-button";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeadListItem } from "@/lib/leads";
import { formatCreated, formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/phone/normalize";

export function LeadsTable({
  campaignId,
  leads,
  createdSort,
}: {
  campaignId: string;
  leads: LeadListItem[];
  createdSort: React.ReactNode;
}) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-end gap-2 text-sm">
        Show full numbers
        <Switch checked={showFull} onCheckedChange={setShowFull} />
      </label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Last call</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>{createdSort}</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name ?? "—"}</TableCell>
              <TableCell title={showFull ? undefined : lead.phone_e164}>
                {showFull ? lead.phone_e164 : maskPhone(lead.phone_e164)}
              </TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell className="capitalize">{lead.interest_level ?? "—"}</TableCell>
              <TableCell>{lead.attempts}</TableCell>
              <TableCell>{formatDateTime(lead.last_call_at)}</TableCell>
              <TableCell className="max-w-48 truncate" title={lead.summary ?? undefined}>
                {lead.summary ?? "—"}
              </TableCell>
              <TableCell>{formatCreated(lead.created_at)}</TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <DeleteLeadButton
                    campaignId={campaignId}
                    leadId={lead.id}
                    name={lead.name ?? lead.phone_e164}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
