import { DateTime } from "luxon";

import { campaignWindowState, type WindowCampaign } from "@/lib/scheduler/window";

export function explainScheduler(
  campaign: WindowCampaign & { status: string },
  now: DateTime,
  usage: { usedToday: number; dailyLimit: number; inProgress: number; maxConcurrent: number; eligible: number },
) {
  if (campaign.status === "paused") return "Campaign paused";
  if (campaign.status === "draft") return "Campaign is still a draft";
  if (campaign.status === "completed") return "This campaign is completed.";

  const window = campaignWindowState(campaign, now);
  const opens = `${campaign.windowStart.slice(0, 5)} ${campaign.timezone}`;
  if (window === "invalid-timezone") return "The campaign timezone is not valid.";
  if (window === "closed-day") return "Not a calling day";
  if (window === "closed-hours") return `Outside call window (opens ${opens})`;
  if (usage.usedToday >= usage.dailyLimit) return "Daily limit reached";
  if (usage.inProgress >= usage.maxConcurrent) return "All lines are busy";
  if (usage.eligible <= 0) return "No leads are waiting";
  return "Ready to call";
}
