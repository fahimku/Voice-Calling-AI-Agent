import { DateTime } from "luxon";

import { requireUser } from "@/lib/auth";
import type { CampaignRow } from "@/lib/campaigns";
import { isMissingColumn, migrationRequiredMessage } from "@/lib/db-error";
import { explainScheduler } from "@/lib/scheduler/explain";
import { isLeadEligible } from "@/lib/scheduler/leads";

export type SchedulerSnapshot =
  | {
      ok: true;
      usedToday: number;
      limit: number;
      inProgress: number;
      eligible: number;
      statusLine: string;
    }
  | { ok: false; message: string };

function missingFunction(error: { code?: string } | null) {
  return Boolean(error && (isMissingColumn(error) || error.code === "PGRST202" || error.code === "42883"));
}

export async function getSchedulerSnapshot(campaign: CampaignRow): Promise<SchedulerSnapshot> {
  const { supabase, userId } = await requireUser();
  const now = DateTime.utc();
  const [used, inProgress, leads, dnc] = await Promise.all([
    supabase.rpc("campaign_calls_used_today", { p_campaign_id: campaign.id }),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "calling"),
    supabase
      .from("leads")
      .select("status, attempts, next_attempt_at, callback_at, phone_e164")
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "no_answer", "voicemail", "failed", "callback"])
      .limit(1000),
    supabase.from("dnc_numbers").select("phone_e164").eq("owner_id", userId),
  ]);

  if (missingFunction(used.error) || isMissingColumn(leads.error)) {
    return { ok: false, message: migrationRequiredMessage };
  }
  if (used.error || inProgress.error || leads.error || dnc.error) {
    return { ok: false, message: "Could not load today's calling progress." };
  }

  const blocked = new Set((dnc.data ?? []).map((row) => String(row.phone_e164)));
  const eligible = (leads.data ?? []).filter((lead) =>
    isLeadEligible(
      {
        status: String(lead.status),
        attempts: Number(lead.attempts),
        nextAttemptAt: typeof lead.next_attempt_at === "string" ? lead.next_attempt_at : null,
        callbackAt: typeof lead.callback_at === "string" ? lead.callback_at : null,
        phone: String(lead.phone_e164),
      },
      { maxAttempts: campaign.max_attempts },
      now,
      blocked,
    ),
  ).length;

  const usedToday = typeof used.data === "number" ? used.data : 0;
  const running = inProgress.count ?? 0;
  return {
    ok: true,
    usedToday,
    limit: campaign.daily_limit,
    inProgress: running,
    eligible,
    statusLine: explainScheduler(
      {
        status: campaign.status,
        timezone: campaign.timezone,
        activeDays: campaign.active_days,
        windowStart: campaign.window_start,
        windowEnd: campaign.window_end,
      },
      now,
      {
        usedToday,
        dailyLimit: campaign.daily_limit,
        inProgress: running,
        maxConcurrent: campaign.max_concurrent,
        eligible,
      },
    ),
  };
}
