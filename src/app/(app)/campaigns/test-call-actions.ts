"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { countRecentTestCalls, getOwnedCampaignAgent } from "@/lib/calls";
import { testCallLimitMessage, testCallWindowMs } from "@/lib/calls/test-call-limit";
import { isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone/normalize";
import { getVoiceProvider } from "@/lib/providers";
import { voiceProviderMode } from "@/lib/providers/mode";
import type { ProviderCall } from "@/lib/providers/types";
import { callPromptVariables } from "@/lib/providers/variables";
import { parseTestCallForm } from "@/lib/validation/calls";
import type { ActionState } from "@/lib/validation/errors";
import { invalidFormState } from "@/lib/validation/errors";

export type TestCallState = ActionState & { ok?: boolean };

const phoneError =
  "Enter a valid phone number. Use a local UAE number, or include + and the country code.";

function safeProviderMessage(error: unknown, phone: string, fallback: string) {
  if (error instanceof Error && error.message && !error.message.includes(phone)) {
    return error.message;
  }
  return fallback;
}

function patchFromCall(result: ProviderCall) {
  const patch: Record<string, unknown> = { status: result.status };
  if (result.endedReason) patch.ended_reason = result.endedReason;
  if (result.durationSeconds != null) patch.duration_seconds = result.durationSeconds;
  if (result.summary) patch.summary = result.summary;
  if (result.transcript) patch.transcript = result.transcript;
  if (result.structuredData) patch.structured_data = result.structuredData;
  if (result.outcome) patch.outcome = result.outcome;
  if (result.status === "ended" || result.status === "failed") {
    patch.ended_at = result.endedAt ?? new Date().toISOString();
  }
  return patch;
}

export async function placeTestCall(campaignId: string, formData: FormData): Promise<TestCallState> {
  const campaign = z.uuid().safeParse(campaignId);
  if (!campaign.success) return { error: "Campaign not found." };

  const parsed = parseTestCallForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const phone = normalizePhone(parsed.data.phone);
  if (!phone.ok) return { error: phoneError, fieldErrors: { phone: phoneError } };

  const owned = await getOwnedCampaignAgent(campaign.data);
  if (owned.missingMigration) return { error: migrationRequiredMessage };
  if (!owned.agent) return { error: "Campaign not found." };

  if (!owned.agent.providerAssistantId) {
    return { error: "This agent needs a Vapi assistant ID." };
  }

  const live = voiceProviderMode() === "live";
  if (live && !owned.agent.providerPhoneNumberId) {
    return {
      error: "Add a Vapi phone number ID on this agent before placing a live test call.",
    };
  }

  const since = new Date(Date.now() - testCallWindowMs).toISOString();
  const recent = await countRecentTestCalls(since);
  if (recent.error) {
    if (isMissingColumn(recent.error)) return { error: migrationRequiredMessage };
    return { error: "Could not check the test-call limit." };
  }
  const limited = testCallLimitMessage(recent.count);
  if (limited) return { error: limited };

  const customerName = parsed.data.name;
  let providerCallId: string;
  try {
    const provider = getVoiceProvider();
    const started = await provider.startCall({
      to: phone.e164,
      customerName: customerName || undefined,
      assistantId: owned.agent.providerAssistantId,
      phoneNumberId: owned.agent.providerPhoneNumberId ?? "",
      variables: callPromptVariables({
        agentVariables: owned.agent.variables,
        agentName: owned.agent.agentDisplayName,
        businessName: owned.agent.businessName,
        customerName,
      }),
    });
    providerCallId = started.providerCallId;
  } catch (error) {
    return { error: safeProviderMessage(error, phone.e164, "Could not place the test call.") };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("calls").insert({
    campaign_id: campaign.data,
    lead_id: null,
    provider_call_id: providerCallId,
    status: "in_progress",
    started_at: new Date().toISOString(),
    is_test: true,
    raw_payload: {
      phone_e164: phone.e164,
      customer_name: customerName || null,
    },
  });

  if (error) {
    if (isMissingColumn(error) || error.code === "23502" || error.code === "42501") {
      return { error: migrationRequiredMessage };
    }
    return { error: "The call started, but saving it failed. Try again." };
  }

  revalidatePath(`/campaigns/${campaign.data}`);
  return { ok: true };
}

export async function refreshTestCall(campaignId: string, callId: string): Promise<TestCallState> {
  const campaign = z.uuid().safeParse(campaignId);
  const call = z.uuid().safeParse(callId);
  if (!campaign.success || !call.success) return { error: "Call not found." };

  const owned = await getOwnedCampaignAgent(campaign.data);
  if (owned.missingMigration) return { error: migrationRequiredMessage };
  if (!owned.agent) return { error: "Call not found." };

  const { supabase } = await requireUser();
  const existing = await supabase
    .from("calls")
    .select("id, provider_call_id, is_test")
    .eq("id", call.data)
    .eq("campaign_id", campaign.data)
    .eq("is_test", true)
    .maybeSingle();

  if (existing.error) {
    if (isMissingColumn(existing.error)) return { error: migrationRequiredMessage };
    return { error: "Could not load this call." };
  }
  if (!existing.data?.provider_call_id) return { error: "Call not found." };

  let snapshot: ProviderCall;
  try {
    snapshot = await getVoiceProvider().getCall(existing.data.provider_call_id);
  } catch (error) {
    return {
      error: safeProviderMessage(error, existing.data.provider_call_id, "Could not refresh this call."),
    };
  }

  const { error } = await supabase
    .from("calls")
    .update(patchFromCall(snapshot))
    .eq("id", call.data)
    .eq("campaign_id", campaign.data);

  if (error) return { error: "Could not save the refreshed status." };

  revalidatePath(`/campaigns/${campaign.data}`);
  return { ok: true };
}
