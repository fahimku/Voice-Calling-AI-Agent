"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-error";
import type { ActionState } from "@/lib/validation/errors";
import { invalidFormState } from "@/lib/validation/errors";
import {
  campaignCanStart,
  campaignStatusActionSchema,
  campaignStatusChange,
  parseCampaignForm,
} from "@/lib/validation/campaigns";

function revalidateCampaign(id?: string) {
  revalidatePath("/campaigns");
  revalidatePath("/agents");
  if (id) {
    revalidatePath(`/campaigns/${id}`);
    revalidatePath(`/campaigns/${id}/edit`);
  }
}

function campaignValues(data: {
  name: string;
  agentId: string;
  timezone: string;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
  activeDays: number[];
  maxConcurrent: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  countRetriesInLimit: boolean;
}) {
  return {
    name: data.name,
    agent_id: data.agentId,
    timezone: data.timezone,
    daily_limit: data.dailyLimit,
    window_start: data.windowStart,
    window_end: data.windowEnd,
    active_days: data.activeDays,
    max_concurrent: data.maxConcurrent,
    max_attempts: data.maxAttempts,
    retry_delay_minutes: data.retryDelayMinutes,
    count_retries_in_limit: data.countRetriesInLimit,
  };
}

async function ownedAgent(agentId: string, userId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("owner_id", userId)
    .maybeSingle();
  return data;
}

export async function createCampaign(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseCampaignForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const { supabase, userId } = await requireUser();
  const agent = await ownedAgent(parsed.data.agentId, userId);
  if (!agent) return { error: "Choose one of your agents." };

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      owner_id: userId,
      status: "draft",
      ...campaignValues(parsed.data),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyDbError(error, "Could not create the campaign.") };
  }

  revalidateCampaign(data.id);
  redirect(`/campaigns/${data.id}?notice=campaign-created`);
}

export async function updateCampaign(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const campaignId = z.uuid().safeParse(id);
  if (!campaignId.success) return { error: "Campaign not found." };

  const parsed = parseCampaignForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const { supabase, userId } = await requireUser();
  const agent = await ownedAgent(parsed.data.agentId, userId);
  if (!agent) return { error: "Choose one of your agents." };

  const { data, error } = await supabase
    .from("campaigns")
    .update(campaignValues(parsed.data))
    .eq("id", campaignId.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: friendlyDbError(error, "Could not update the campaign.") };
  }
  if (!data) return { error: "Campaign not found." };

  revalidateCampaign(campaignId.data);
  redirect(`/campaigns/${campaignId.data}?notice=campaign-updated`);
}

export async function deleteCampaign(
  id: string,
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const campaignId = z.uuid().safeParse(id);
  if (!campaignId.success) return { error: "Campaign not found." };

  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: friendlyDbError(error, "Could not delete the campaign.") };
  }
  if (!data) return { error: "Campaign not found." };

  revalidateCampaign(campaignId.data);
  redirect("/campaigns?notice=campaign-deleted");
}

export async function setCampaignStatus(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const campaignId = z.uuid().safeParse(id);
  if (!campaignId.success) return { error: "Campaign not found." };

  const intent = campaignStatusActionSchema.safeParse(formData.get("intent"));
  if (!intent.success) return { error: "Choose a status change." };

  const { supabase, userId } = await requireUser();
  const { data: campaign, error: loadError } = await supabase
    .from("campaigns")
    .select("id, status, agent_id, daily_limit, window_start, window_end")
    .eq("id", campaignId.data)
    .eq("owner_id", userId)
    .maybeSingle();

  if (loadError) return { error: "Could not load this campaign." };
  if (!campaign) return { error: "Campaign not found." };

  const nextStatus = campaignStatusChange(intent.data, campaign.status);
  if (!nextStatus) return { error: "That status change is not available." };

  if (intent.data === "start") {
    const blocker = campaignCanStart({
      agentId: campaign.agent_id,
      dailyLimit: campaign.daily_limit,
      windowStart: campaign.window_start,
      windowEnd: campaign.window_end,
    });
    if (blocker) return { error: blocker };
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: nextStatus })
    .eq("id", campaignId.data)
    .eq("owner_id", userId)
    .eq("status", campaign.status)
    .select("id")
    .maybeSingle();

  if (error) return { error: friendlyDbError(error, "Could not update the campaign status.") };
  if (!data) return { error: "The campaign status changed. Refresh and try again." };

  revalidateCampaign(campaignId.data);
  redirect(`/campaigns/${campaignId.data}?notice=campaign-${intent.data}`);
}
