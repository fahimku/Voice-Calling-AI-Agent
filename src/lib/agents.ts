import { requireUser } from "@/lib/auth";
import { isMissingColumn } from "@/lib/db-error";
import type { businessTypes } from "@/lib/validation/agents";

export type AgentRow = {
  id: string;
  name: string;
  business_type: (typeof businessTypes)[number];
  provider_assistant_id: string;
  provider_phone_number_id: string | null;
  notes: string | null;
  agent_display_name: string | null;
  business_name: string | null;
  variables: Record<string, string>;
  created_at: string;
};

const agentColumns =
  "id, name, business_type, provider_assistant_id, provider_phone_number_id, notes, created_at";

const agentDetailColumns = `${agentColumns}, agent_display_name, business_name, variables`;

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

  return (data ?? []).map((row) => asAgent(row as Record<string, unknown>));
}

function asAgent(row: Record<string, unknown>): AgentRow {
  const variables =
    row.variables && typeof row.variables === "object" && !Array.isArray(row.variables)
      ? (row.variables as Record<string, string>)
      : {};
  return {
    ...(row as Omit<AgentRow, "agent_display_name" | "business_name" | "variables">),
    agent_display_name: typeof row.agent_display_name === "string" ? row.agent_display_name : null,
    business_name: typeof row.business_name === "string" ? row.business_name : null,
    variables,
  };
}

export async function getAgent(id: string) {
  const { supabase, userId } = await requireUser();
  const first = await supabase
    .from("agents")
    .select(agentDetailColumns)
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (first.error && isMissingColumn(first.error)) {
    const second = await supabase
      .from("agents")
      .select(agentColumns)
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (second.error) throw new Error("Could not load this agent.");
    return second.data ? asAgent(second.data as Record<string, unknown>) : null;
  }

  if (first.error) {
    throw new Error("Could not load this agent.");
  }

  return first.data ? asAgent(first.data as Record<string, unknown>) : null;
}
