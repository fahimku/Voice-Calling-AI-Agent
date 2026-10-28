import { IANAZone } from "luxon";
import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM.");

function numeric(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}

function intInRange(label: string, min: number, max: number) {
  return z.preprocess(
    numeric,
    z
      .number({ error: `Enter a ${label}.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`),
  );
}

const campaignObjectSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name.")
      .max(120, "Name must be 120 characters or fewer."),
    agentId: z.uuid("Choose an agent."),
    timezone: z
      .string()
      .trim()
      .refine((value) => IANAZone.isValidZone(value), "Choose a valid timezone."),
    dailyLimit: intInRange("Daily limit", 1, 1000),
    windowStart: timeSchema,
    windowEnd: timeSchema,
    activeDays: z.preprocess(
      (value) => {
        if (!Array.isArray(value)) return value;
        return value.map((day) => (typeof day === "string" ? Number(day) : day));
      },
      z
        .array(
          z
            .number()
            .int()
            .min(1, "Choose a day from Monday to Sunday.")
            .max(7, "Choose a day from Monday to Sunday."),
        )
        .min(1, "Choose at least one active day."),
    ),
    maxConcurrent: intInRange("Max concurrent", 1, 10),
    maxAttempts: intInRange("Max attempts", 1, 5),
    retryDelayMinutes: intInRange("Retry delay", 15, 1440),
    countRetriesInLimit: z.preprocess((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }, z.boolean({ error: "Choose whether retries count toward the daily limit." })),
  });

export const campaignSchema = campaignObjectSchema.superRefine((value, ctx) => {
    if (value.windowStart >= value.windowEnd) {
      ctx.addIssue({
        code: "custom",
        message: "End time must be later than the start time.",
        path: ["windowEnd"],
      });
    }

    if (new Set(value.activeDays).size !== value.activeDays.length) {
      ctx.addIssue({
        code: "custom",
        message: "Choose each day only once.",
        path: ["activeDays"],
      });
    }
  });

export type CampaignInput = z.infer<typeof campaignSchema>;

export const campaignStatusActionSchema = z.enum(
  ["start", "pause", "resume", "complete", "reopen"],
  { error: "Choose a status change." },
);

const campaignStatusChanges = {
  start: { from: ["draft"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  complete: { from: ["draft", "active", "paused"], to: "completed" },
  reopen: { from: ["completed"], to: "paused" },
} as const;

export type CampaignStatusIntent = keyof typeof campaignStatusChanges;

export function campaignStatusChange(intent: string, status: string) {
  if (!(intent in campaignStatusChanges)) return null;
  const change = campaignStatusChanges[intent as CampaignStatusIntent];
  if (!(change.from as readonly string[]).includes(status)) return null;
  return change.to;
}

export function shouldPauseForNewLeads(status: string, inserted: number) {
  return status === "completed" && inserted > 0;
}

const sheetActionStatuses = ["draft", "active", "paused", "completed"] as const;

export function sheetActionsAllowed(status: string) {
  return (sheetActionStatuses as readonly string[]).includes(status);
}

export function ownedCampaignError(input: { queryFailed: boolean; found: boolean }) {
  if (input.queryFailed) return "Could not load this campaign.";
  if (!input.found) return "Campaign not found.";
  return null;
}

export function campaignCanStart(input: {
  agentId: string;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
}) {
  const parsed = campaignObjectSchema.pick({
    agentId: true,
    dailyLimit: true,
    windowStart: true,
    windowEnd: true,
  }).safeParse({
    agentId: input.agentId,
    dailyLimit: input.dailyLimit,
    windowStart: input.windowStart.slice(0, 5),
    windowEnd: input.windowEnd.slice(0, 5),
  });

  if (parsed.success) {
    if (parsed.data.windowStart >= parsed.data.windowEnd) {
      return "Set a call window with an end time later than the start time before starting.";
    }
    return null;
  }

  const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
  if (fields.has("agentId")) {
    return "Assign an agent before starting this campaign.";
  }
  if (fields.has("windowStart") || fields.has("windowEnd")) {
    return "Set a call window with an end time later than the start time before starting.";
  }
  if (fields.has("dailyLimit")) {
    return "Set a daily limit between 1 and 1000 before starting.";
  }
  return "Check the agent, call window, and daily limit before starting.";
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export function parseCampaignForm(formData: FormData) {
  return campaignSchema.safeParse({
    name: text(formData.get("name")),
    agentId: text(formData.get("agentId")),
    timezone: text(formData.get("timezone")),
    dailyLimit: text(formData.get("dailyLimit")),
    windowStart: text(formData.get("windowStart")).slice(0, 5),
    windowEnd: text(formData.get("windowEnd")).slice(0, 5),
    activeDays: formData.getAll("activeDays"),
    maxConcurrent: text(formData.get("maxConcurrent")),
    maxAttempts: text(formData.get("maxAttempts")),
    retryDelayMinutes: text(formData.get("retryDelayMinutes")),
    countRetriesInLimit: text(formData.get("countRetriesInLimit")),
  });
}
