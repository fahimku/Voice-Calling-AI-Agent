import { DateTime } from "luxon";

export type WindowCampaign = {
  timezone: string;
  activeDays: number[];
  windowStart: string;
  windowEnd: string;
};

export type WindowState = "open" | "closed-day" | "closed-hours" | "invalid-timezone";

export function localDayBounds(now: DateTime, timezone: string) {
  const local = now.setZone(timezone);
  if (!local.isValid) return null;
  const start = local.startOf("day");
  return {
    startUtc: start.toUTC(),
    endUtc: start.plus({ days: 1 }).toUTC(),
  };
}

function clockSeconds(value: string) {
  const [hour = "0", minute = "0", second = "0"] = value.split(":");
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second);
}

export function campaignWindowState(campaign: WindowCampaign, now: DateTime): WindowState {
  const local = now.setZone(campaign.timezone);
  if (!local.isValid) return "invalid-timezone";
  if (!campaign.activeDays.includes(local.weekday)) return "closed-day";

  const current = local.hour * 3600 + local.minute * 60 + local.second;
  const start = clockSeconds(campaign.windowStart);
  const end = clockSeconds(campaign.windowEnd);
  if (current >= start && current < end) return "open";
  return "closed-hours";
}

export function isCampaignOpen(campaign: WindowCampaign, now: DateTime) {
  return campaignWindowState(campaign, now) === "open";
}
