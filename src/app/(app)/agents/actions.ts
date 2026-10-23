"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-error";
import type { ActionState } from "@/lib/validation/errors";
import { invalidFormState } from "@/lib/validation/errors";
import { parseAgentForm } from "@/lib/validation/agents";

function revalidateAgents() {
  revalidatePath("/agents");
  revalidatePath("/campaigns");
}

export async function createAgent(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAgentForm(formData);
  if (!parsed.success) return invalidFormState(parsed.error);

  const { supabase, userId } = await requireUser();
  const phone = parsed.data.providerPhoneNumberId;
  const notes = parsed.data.notes;
  const { error } = await supabase.from("agents").insert({
    owner_id: userId,
    name: parsed.data.name,
    business_type: parsed.data.businessType,
    provider: "vapi",
    provider_assistant_id: parsed.data.providerAssistantId,
    provider_phone_number_id: phone.length > 0 ? phone : null,
    notes: notes.length > 0 ? notes : null,
  });

  if (error) {
    return { error: friendlyDbError(error, "Could not create the agent.") };
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
  const phone = parsed.data.providerPhoneNumberId;
  const notes = parsed.data.notes;
  const { data, error } = await supabase
    .from("agents")
    .update({
      name: parsed.data.name,
      business_type: parsed.data.businessType,
      provider_assistant_id: parsed.data.providerAssistantId,
      provider_phone_number_id: phone.length > 0 ? phone : null,
      notes: notes.length > 0 ? notes : null,
    })
    .eq("id", agentId.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: friendlyDbError(error, "Could not update the agent.") };
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
