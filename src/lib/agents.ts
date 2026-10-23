import { requireUser } from "@/lib/auth";
import type { businessTypes } from "@/lib/validation/agents";

export type AgentRow = {
  id: string;
  name: string;
  business_type: (typeof businessTypes)[number];
  provider_assistant_id: string;
  provider_phone_number_id: string | null;
  notes: string | null;
  created_at: string;
};

const agentColumns =
  "id, name, business_type, provider_assistant_id, provider_phone_number_id, notes, created_at";

export async function listAgents() {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("agents")
    .select(agentColumns)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not load agents.");
  }

  return (data ?? []) as AgentRow[];
}

export async function getAgent(id: string) {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("agents")
    .select(agentColumns)
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load this agent.");
  }

  return data as AgentRow | null;
}
