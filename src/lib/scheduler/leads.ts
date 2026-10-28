import { DateTime } from "luxon";

const retryStatuses = new Set(["no_answer", "voicemail", "failed"]);

export type SchedulerLead = {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  callbackAt: string | null;
  createdAt: string;
};

export function nextRetryAt(now: DateTime, retryDelayMinutes: number) {
  return now.plus({ minutes: retryDelayMinutes });
}

export function retryAtIso(
  attempts: number,
  maxAttempts: number,
  retryDelayMinutes: number,
  now: DateTime,
) {
  if (attempts >= maxAttempts) return null;
  return nextRetryAt(now, retryDelayMinutes).toUTC().toISO();
}

function atOrBefore(value: string | null, now: DateTime) {
  if (!value) return false;
  const parsed = DateTime.fromISO(value, { zone: "utc" });
  return parsed.isValid && parsed.toMillis() <= now.toMillis();
}

export function isLeadEligible(
  lead: Pick<SchedulerLead, "status" | "attempts" | "nextAttemptAt" | "callbackAt" | "phone">,
  campaign: { maxAttempts: number },
  now: DateTime,
  dnc?: ReadonlySet<string>,
) {
  if (dnc?.has(lead.phone)) return false;
  if (lead.status === "pending") return true;
  if (retryStatuses.has(lead.status)) {
    return lead.attempts < campaign.maxAttempts && atOrBefore(lead.nextAttemptAt, now);
  }
  if (lead.status === "callback") return atOrBefore(lead.callbackAt, now);
  return false;
}

export function isLeadStillOpen(
  lead: Pick<SchedulerLead, "status" | "attempts" | "phone">,
  campaign: { maxAttempts: number },
  dnc?: ReadonlySet<string>,
) {
  if (dnc?.has(lead.phone) && lead.status !== "calling") return false;
  if (lead.status === "pending" || lead.status === "calling" || lead.status === "callback") return true;
  if (retryStatuses.has(lead.status) && lead.attempts < campaign.maxAttempts) return true;
  return false;
}

function claimRank(status: string) {
  if (status === "callback") return 0;
  if (retryStatuses.has(status)) return 1;
  return 2;
}

export function claimCandidates(
  leads: SchedulerLead[],
  input: {
    lockedIds: ReadonlySet<string>;
    batchSize: number;
    dnc: ReadonlySet<string>;
    now: DateTime;
    maxAttempts: number;
  },
) {
  if (input.batchSize <= 0) return [];
  return leads
    .filter((lead) => !input.lockedIds.has(lead.id) && isLeadEligible(lead, input, input.now, input.dnc))
    .sort((left, right) => {
      const rank = claimRank(left.status) - claimRank(right.status);
      if (rank !== 0) return rank;
      return left.createdAt.localeCompare(right.createdAt);
    })
    .slice(0, input.batchSize);
}
