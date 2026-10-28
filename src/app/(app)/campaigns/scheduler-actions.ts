"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { executeCampaignTick } from "@/lib/scheduler/execute";

export async function runSchedulerNow(campaignId: string) {
  const parsed = z.uuid().safeParse(campaignId);
  if (!parsed.success) return { error: "Campaign not found." };

  const { supabase, userId } = await requireUser();
  const owned = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data)
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned.error || !owned.data) return { error: "Campaign not found." };

  const result = await executeCampaignTick(supabase, parsed.data, DateTime.utc());
  revalidatePath(`/campaigns/${parsed.data}`);
  revalidatePath(`/campaigns/${parsed.data}/calls`);
  revalidatePath(`/campaigns/${parsed.data}/leads`);

  const message = result.skippedReason
    ? result.skippedReason
    : `Started ${result.started} calls. ${result.usedToday} of ${result.limit} used today.`;
  return { ok: true as const, message, result };
}
