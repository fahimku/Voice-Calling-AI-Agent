"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { friendlyDbError, isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import type { AgentInput } from "@/lib/validation/agents";
import { parseAgentForm, variablesRecord } from "@/lib/validation/agents";
import type { ActionState } from "@/lib/validation/errors";
import { invalidFormState } from "@/lib/validation/errors";

function revalidateAgents() {
  revalidatePath("/agents");
  revalidatePath("/campaigns");
}

function agentFields(data: AgentInput) {
  const phone = data.providerPhoneNumberId;
  const notes = data.notes;
  return {
    name: data.name,
    business_type: data.businessType,
    provider_assistant_id: data.providerAssistantId,
    provider_phone_number_id: phone.length > 0 ? phone : null,
    notes: notes.length > 0 ? notes : null,
    agent_display_name: data.agentDisplayName.length > 0 ? data.agentDisplayName : null,
    business_name: data.businessName.length > 0 ? data.businessName : null,
    variables: variablesRecord(data.variables),
  };
}

function agentWriteError(error: { code?: string } | null, fallback: string) {
  if (isMissingColumn(error)) return migrationRequiredMessage;
  return friendlyDbError(error, fallback);
}

export async function createAgent(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAgentForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("agents").insert({
    owner_id: userId,
    provider: "vapi",
    ...agentFields(parsed.data),
  });

  if (error) {
    return { error: agentWriteError(error, "Could not create the agent.") };
  }

  revalidateAgents();
  redirect("/agents?notice=agent-created");
}

export async function updateAgent(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const agentId = z.uuid().safeParse(id);
  if (!agentId.success) return { error: "Agent not found." };

  const parsed = parseAgentForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("agents")
    .update(agentFields(parsed.data))
    .eq("id", agentId.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: agentWriteError(error, "Could not update the agent.") };
  }
  if (!data) return { error: "Agent not found." };

  revalidateAgents();
  redirect("/agents?notice=agent-updated");
}

export async function deleteAgent(
  id: string,
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const agentId = z.uuid().safeParse(id);
  if (!agentId.success) return { error: "Agent not found." };

  const { supabase, userId } = await requireUser();
  const { count, error: countError } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId.data)
    .eq("owner_id", userId);

  if (countError) {
    return { error: "Could not check whether this agent is used by a campaign." };
  }
  if ((count ?? 0) > 0) {
    return {
      error:
        "This agent is used by a campaign. Remove it from those campaigns before deleting it.",
    };
  }

  const { data, error } = await supabase
    .from("agents")
    .delete()
    .eq("id", agentId.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: friendlyDbError(error, "Could not delete the agent.") };
  }
  if (!data) return { error: "Agent not found." };

  revalidateAgents();
  redirect("/agents?notice=agent-deleted");
}
