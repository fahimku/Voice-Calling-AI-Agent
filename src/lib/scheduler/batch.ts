import { DateTime } from "luxon";

import { localDayBounds } from "@/lib/scheduler/window";

export function computeBatchSize(input: {
  dailyLimit: number;
  usedToday: number;
  maxConcurrent: number;
  inProgress: number;
}) {
  return Math.max(0, Math.min(input.dailyLimit - input.usedToday, input.maxConcurrent - input.inProgress));
}

export function effectiveUsage(input: {
  recordedUsed: number;
  unrecordedFirstAttempts: number;
  unrecordedRetries: number;
  countRetriesInLimit: boolean;
}) {
  const retries = input.countRetriesInLimit ? input.unrecordedRetries : 0;
  return input.recordedUsed + input.unrecordedFirstAttempts + retries;
}

export type UsageCall = {
  startedAt: string;
  isTest: boolean;
  attemptNumber: number | null;
};

export function countUsedToday(
  calls: UsageCall[],
  now: DateTime,
  timezone: string,
  countRetriesInLimit: boolean,
) {
  const bounds = localDayBounds(now, timezone);
  if (!bounds) return 0;
  const start = bounds.startUtc.toMillis();
  const end = bounds.endUtc.toMillis();

  return calls.filter((call) => {
    if (call.isTest) return false;
    const at = DateTime.fromISO(call.startedAt, { zone: "utc" }).toMillis();
    if (!Number.isFinite(at) || at < start || at >= end) return false;
    if (!countRetriesInLimit && call.attemptNumber !== 1) return false;
    return true;
  }).length;
}
