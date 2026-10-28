"use server";

import { revalidatePath } from "next/cache";

import { friendlyDbError } from "@/lib/db-error";
import { findPhoneMatches, getOwnedCampaign } from "@/lib/leads";
import { cleanLeadName, previewImport, type MappedLeadRow } from "@/lib/leads/preview";
import { normalizePhone } from "@/lib/phone/normalize";
import type { ActionState } from "@/lib/validation/errors";
import { invalidFormState } from "@/lib/validation/errors";
import { leadImportSchema, parseSingleLead, phoneMatchSchema } from "@/lib/validation/leads";

const insertChunkSize = 500;

export type LeadActionState = ActionState & {
  ok?: boolean;
  inserted?: number;
  skipped?: number;
};

function revalidateLeads(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/leads`);
}

export async function matchImportPhones(
  campaignId: string,
  phones: string[],
): Promise<{ existing: string[]; dnc: string[] } | LeadActionState> {
  const parsed = phoneMatchSchema.safeParse({ campaignId, phones });
  if (!parsed.success) return { error: "Could not check these numbers." };

  const owned = await getOwnedCampaign(parsed.data.campaignId);
  if (!owned) return { error: "This campaign was not found." };

  const unique = [...new Set(parsed.data.phones)];
  const matches = await findPhoneMatches(owned.supabase, owned.userId, owned.campaign.id, unique);
  return { existing: [...matches.existing], dnc: [...matches.dnc] };
}

export async function importLeads(
  campaignId: string,
  rows: Array<{ name: string; phone: string; extra: Record<string, string> }>,
): Promise<LeadActionState> {
  const parsed = leadImportSchema.safeParse({ campaignId, rows });
  if (!parsed.success) return invalidFormState(parsed.error);

  const owned = await getOwnedCampaign(parsed.data.campaignId);
  if (!owned) return { error: "This campaign was not found." };

  const mapped: MappedLeadRow[] = parsed.data.rows.map((row, index) => ({
    rowNumber: index + 2,
    rawName: row.name,
    rawPhone: row.phone,
    extra: row.extra,
  }));
  const normalized = mapped.flatMap((row) => {
    const phone = normalizePhone(row.rawPhone);
    return phone.ok ? [phone.e164] : [];
  });
  const matches = await findPhoneMatches(owned.supabase, owned.userId, owned.campaign.id, [...new Set(normalized)]);
  const preview = previewImport(mapped, matches.existing, matches.dnc);

  if (preview.insertable.length === 0) {
    return { error: "None of these rows can be imported.", inserted: 0, skipped: parsed.data.rows.length };
  }

  let inserted = 0;
  for (let index = 0; index < preview.insertable.length; index += insertChunkSize) {
    const chunk = preview.insertable.slice(index, index + insertChunkSize).map((row) => ({
      campaign_id: owned.campaign.id,
      name: row.name,
      phone_e164: row.phone,
      extra: row.extra,
      status: "pending" as const,
    }));
    const { data, error } = await owned.supabase
      .from("leads")
      .upsert(chunk, {
        onConflict: "campaign_id,phone_e164",
        ignoreDuplicates: true,
        defaultToNull: false,
      })
      .select("id");

    if (error) return { error: friendlyDbError(error, "Could not import leads.") };
    inserted += data?.length ?? 0;
  }

  revalidateLeads(owned.campaign.id);
  return {
    ok: true,
    inserted,
    skipped: parsed.data.rows.length - inserted,
  };
}

export async function addLead(
  campaignId: string,
  _state: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const parsed = parseSingleLead(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const owned = await getOwnedCampaign(campaignId);
  if (!owned) return { error: "This campaign was not found." };

  const phone = normalizePhone(parsed.data.phone);
  if (!phone.ok) {
    return {
      error: "Check the form and try again.",
      fieldErrors: {
        phone: phone.reason === "empty" ? "Enter a phone number." : "Enter a valid phone number.",
      },
    };
  }

  const matches = await findPhoneMatches(owned.supabase, owned.userId, owned.campaign.id, [phone.e164]);
  if (matches.dnc.has(phone.e164)) {
    return { error: "This number is on your do-not-call list." };
  }

  const { error } = await owned.supabase.from("leads").insert({
    campaign_id: owned.campaign.id,
    name: cleanLeadName(parsed.data.name),
    phone_e164: phone.e164,
    extra: {},
    status: "pending",
  });

  if (error?.code === "23505") return { error: "This number is already in the campaign." };
  if (error) return { error: friendlyDbError(error, "Could not add the lead.") };

  revalidateLeads(owned.campaign.id);
  return { ok: true };
}

export async function deleteLead(
  campaignId: string,
  leadId: string,
  _state: LeadActionState,
  _formData: FormData,
): Promise<LeadActionState> {
  const owned = await getOwnedCampaign(campaignId);
  if (!owned) return { error: "This campaign was not found." };

  const { data, error } = await owned.supabase
    .from("leads")
    .select("id, status")
    .eq("id", leadId)
    .eq("campaign_id", owned.campaign.id)
    .maybeSingle();

  if (error) return { error: "Could not delete the lead." };
  if (!data) return { error: "This lead was not found." };
  if (data.status === "calling") {
    return { error: "This lead is being called, so it cannot be deleted yet." };
  }

  const { error: deleteError, count } = await owned.supabase
    .from("leads")
    .delete({ count: "exact" })
    .eq("id", leadId)
    .eq("campaign_id", owned.campaign.id)
    .neq("status", "calling");

  if (deleteError) return { error: friendlyDbError(deleteError, "Could not delete the lead.") };
  if (!count) return { error: "This lead is being called, so it cannot be deleted yet." };

  revalidateLeads(owned.campaign.id);
  return { ok: true };
}
