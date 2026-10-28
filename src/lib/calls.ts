import { requireUser } from "@/lib/auth";
import { isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import { maskPhone } from "@/lib/phone/normalize";

export type TestCallListItem = {
  id: string;
  status: string;
  outcome: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  maskedPhone: string;
};

export type CampaignCallAgent = {
  providerAssistantId: string;
  providerPhoneNumberId: string | null;
  agentDisplayName: string | null;
  businessName: string | null;
  variables: Record<string, string>;
};

export type TestCallSection =
  | { ok: true; agent: CampaignCallAgent; calls: TestCallListItem[] }
  | { ok: false; message: string };

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") record[key] = entry;
  }
  return record;
}

function oneRow(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

function agentFromEmbed(value: unknown): CampaignCallAgent | null {
  const agent = oneRow(value);
  if (!agent || typeof agent.provider_assistant_id !== "string") return null;
  return {
    providerAssistantId: agent.provider_assistant_id,
    providerPhoneNumberId:
      typeof agent.provider_phone_number_id === "string" ? agent.provider_phone_number_id : null,
    agentDisplayName: typeof agent.agent_display_name === "string" ? agent.agent_display_name : null,
    businessName: typeof agent.business_name === "string" ? agent.business_name : null,
    variables: stringRecord(agent.variables),
  };
}

function maskedFromPayload(value: unknown) {
  const payload = oneRow(value);
  const phone = payload?.phone_e164;
  return typeof phone === "string" ? maskPhone(phone) : "••••";
}

export async function getOwnedCampaignAgent(campaignId: string) {
  const { supabase, userId } = await requireUser();
  const result = await supabase
    .from("campaigns")
    .select(
      `
      id,
      agents (
        provider_assistant_id,
        provider_phone_number_id,
        agent_display_name,
        business_name,
        variables
      )
    `,
    )
    .eq("id", campaignId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (result.error && isMissingColumn(result.error)) {
    return { missingMigration: true as const, agent: null };
  }
  if (result.error || !result.data) return { missingMigration: false as const, agent: null };
  return { missingMigration: false as const, agent: agentFromEmbed(result.data.agents) };
}

export async function countRecentTestCalls(sinceIso: string) {
  const { supabase, userId } = await requireUser();
  const campaigns = await supabase.from("campaigns").select("id").eq("owner_id", userId);
  if (campaigns.error) return { error: campaigns.error, count: 0 };

  const ids = (campaigns.data ?? []).map((row) => row.id);
  if (ids.length === 0) return { error: null, count: 0 };

  const calls = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .in("campaign_id", ids)
    .eq("is_test", true)
    .gte("created_at", sinceIso);

  return { error: calls.error, count: calls.count ?? 0 };
}

export type CampaignCallItem = {
  id: string;
  status: string;
  outcome: string | null;
  attemptNumber: number | null;
  startedAt: string | null;
  maskedPhone: string;
};

export async function listCampaignCalls(campaignId: string) {
  const { supabase, userId } = await requireUser();
  const owned = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned.error || !owned.data) return { ok: false as const, message: "Campaign not found." };

  const calls = await supabase
    .from("calls")
    .select("id, status, outcome, attempt_number, started_at, leads ( phone_e164 )")
    .eq("campaign_id", campaignId)
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (calls.error && isMissingColumn(calls.error)) {
    return { ok: false as const, message: migrationRequiredMessage };
  }
  if (calls.error) return { ok: false as const, message: "Could not load calls." };

  return {
    ok: true as const,
    calls: (calls.data ?? []).map((row) => {
      const lead = oneRow(row.leads);
      const phone = lead && typeof lead.phone_e164 === "string" ? lead.phone_e164 : "";
      return {
        id: String(row.id),
        status: String(row.status),
        outcome: typeof row.outcome === "string" ? row.outcome : null,
        attemptNumber: typeof row.attempt_number === "number" ? row.attempt_number : null,
        startedAt: typeof row.started_at === "string" ? row.started_at : null,
        maskedPhone: phone ? maskPhone(phone) : "—",
      } satisfies CampaignCallItem;
    }),
  };
}

export async function getTestCallSection(campaignId: string): Promise<TestCallSection> {
  const owned = await getOwnedCampaignAgent(campaignId);
  if (owned.missingMigration) return { ok: false, message: migrationRequiredMessage };
  if (!owned.agent) return { ok: false, message: "Could not load this campaign's agent." };

  const { supabase } = await requireUser();
  const calls = await supabase
    .from("calls")
    .select("id, status, outcome, started_at, duration_seconds, summary, raw_payload")
    .eq("campaign_id", campaignId)
    .eq("is_test", true)
    .order("created_at", { ascending: false })
    .limit(10);

  if (calls.error && isMissingColumn(calls.error)) {
    return { ok: false, message: migrationRequiredMessage };
  }
  if (calls.error) return { ok: false, message: "Could not load test calls." };

  return {
    ok: true,
    agent: owned.agent,
    calls: (calls.data ?? []).map((row) => ({
      id: String(row.id),
      status: String(row.status),
      outcome: typeof row.outcome === "string" ? row.outcome : null,
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      summary: typeof row.summary === "string" ? row.summary : null,
      maskedPhone: maskedFromPayload(row.raw_payload),
    })),
  };
}
