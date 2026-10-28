import { DateTime } from "luxon";

import { campaignWindowState, isCampaignOpen, type WindowCampaign } from "@/lib/scheduler/window";

export const chartOutcomes = ["interested", "not_interested", "no_answer", "voicemail", "failed"] as const;

export type ChartOutcome = (typeof chartOutcomes)[number];

export const chartOutcomeLabels: Record<ChartOutcome, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  no_answer: "No answer",
  voicemail: "Voicemail",
  failed: "Failed",
};

export type OutcomeRow = { day: string; outcome: string; total: number };

export function sumCampaignUsage(rows: { used: number; dailyLimit: number }[]) {
  return rows.reduce(
    (sum, row) => ({
      used: sum.used + row.used,
      dailyLimit: sum.dailyLimit + row.dailyLimit,
    }),
    { used: 0, dailyLimit: 0 },
  );
}

export function buildOutcomeSeries(startDay: string, days: number, rows: OutcomeRow[]) {
  const start = DateTime.fromISO(startDay, { zone: "Asia/Dubai" }).startOf("day");
  const series: Array<{ day: string; label: string } & Record<ChartOutcome, number>> = [];
  for (let index = 0; index < days; index += 1) {
    const date = start.plus({ days: index });
    const day = date.toISODate() ?? "";
    const point = {
      day,
      label: date.toFormat("d LLL"),
      interested: 0,
      not_interested: 0,
      no_answer: 0,
      voicemail: 0,
      failed: 0,
    };
    series.push(point);
  }
  const byDay = new Map(series.map((point) => [point.day, point]));
  for (const row of rows) {
    const point = byDay.get(row.day.slice(0, 10));
    if (!point || !(chartOutcomes as readonly string[]).includes(row.outcome)) continue;
    point[row.outcome as ChartOutcome] += row.total;
  }
  return series;
}

export type FunnelCounts = {
  total: number;
  called: number;
  answered: number;
  interested: number;
};

export function funnelSteps(counts: FunnelCounts) {
  return [
    { key: "total", label: "Total leads", value: counts.total },
    { key: "called", label: "Called", value: counts.called },
    { key: "answered", label: "Answered", value: counts.answered },
    { key: "interested", label: "Interested", value: counts.interested },
  ];
}

export type AttentionCampaign = WindowCampaign & { id: string; name: string };

export function campaignsOutsideWindow(campaigns: AttentionCampaign[], now: DateTime) {
  return campaigns.flatMap((campaign) => {
    if (isCampaignOpen(campaign, now)) return [];
    const state = campaignWindowState(campaign, now);
    const reason =
      state === "closed-day"
        ? "Active, but today is not a calling day."
        : state === "invalid-timezone"
          ? "Active, but the timezone is not valid."
          : "Active, but outside the call window.";
    return [{ id: campaign.id, name: campaign.name, reason }];
  });
}

export function formatUsd(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
