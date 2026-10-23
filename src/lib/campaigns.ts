import { requireUser } from "@/lib/auth";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  agent_id: string;
  agent_name: string;
  timezone: string;
  daily_limit: number;
  window_start: string;
  window_end: string;
  active_days: number[];
  max_concurrent: number;
  max_attempts: number;
  retry_delay_minutes: number;
  count_retries_in_limit: boolean;
  created_at: string;
};

type CampaignQueryRow = Omit<CampaignRow, "agent_name"> & {
  agents: { name: string } | { name: string }[] | null;
};

const campaignColumns = `
  id,
  name,
  status,
  agent_id,
  timezone,
  daily_limit,
  window_start,
  window_end,
  active_days,
  max_concurrent,
  max_attempts,
  retry_delay_minutes,
  count_retries_in_limit,
  created_at,
  agents ( name )
`;

function agentName(value: CampaignQueryRow["agents"]) {
  if (Array.isArray(value)) return value[0]?.name ?? "Unknown agent";
  return value?.name ?? "Unknown agent";
}

function mapCampaign(row: CampaignQueryRow): CampaignRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    agent_id: row.agent_id,
    agent_name: agentName(row.agents),
    timezone: row.timezone,
    daily_limit: row.daily_limit,
    window_start: row.window_start,
    window_end: row.window_end,
    active_days: row.active_days,
    max_concurrent: row.max_concurrent,
    max_attempts: row.max_attempts,
    retry_delay_minutes: row.retry_delay_minutes,
    count_retries_in_limit: row.count_retries_in_limit,
    created_at: row.created_at,
  };
}

export async function listCampaigns() {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .select(campaignColumns)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not load campaigns.");
  }

  return ((data ?? []) as CampaignQueryRow[]).map(mapCampaign);
}

export async function getCampaign(id: string) {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .select(campaignColumns)
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load this campaign.");
  }

  return data ? mapCampaign(data as CampaignQueryRow) : null;
}
