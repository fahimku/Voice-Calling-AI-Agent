import { z } from "zod";

import { MAX_IMPORT_ROWS } from "@/lib/leads/preview";

export const leadStatuses = [
  "pending",
  "calling",
  "no_answer",
  "voicemail",
  "interested",
  "not_interested",
  "callback",
  "do_not_call",
  "failed",
  "completed",
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const leadStatusLabels: Record<LeadStatus, string> = {
  pending: "Pending",
  calling: "Calling",
  no_answer: "No answer",
  voicemail: "Voicemail",
  interested: "Interested",
  not_interested: "Not interested",
  callback: "Callback",
  do_not_call: "Do not call",
  failed: "Failed",
  completed: "Completed",
};

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/);

export const leadImportRowSchema = z.object({
  name: z.string().max(200),
  phone: z.string().max(40),
  extra: z.record(z.string().max(80), z.string().max(500)).refine((value) => Object.keys(value).length <= 30, {
    message: "A row has too many extra columns.",
  }),
});

export const leadImportSchema = z.object({
  campaignId: z.uuid(),
  rows: z.array(leadImportRowSchema).min(1, "Choose at least one lead.").max(MAX_IMPORT_ROWS),
});

export const phoneMatchSchema = z.object({
  campaignId: z.uuid(),
  phones: z.array(e164).max(MAX_IMPORT_ROWS),
});

export const singleLeadSchema = z.object({
  name: z.string().trim().max(200, "Name must be 200 characters or fewer."),
  phone: z.string().trim().min(1, "Enter a phone number.").max(40, "Phone number is too long."),
});

export function parseSingleLead(formData: FormData) {
  return singleLeadSchema.safeParse({
    name: typeof formData.get("name") === "string" ? formData.get("name") : "",
    phone: typeof formData.get("phone") === "string" ? formData.get("phone") : "",
  });
}

export function parseLeadListQuery(input: {
  q?: string;
  status?: string;
  page?: string;
  sort?: string;
}) {
  const pageNumber = Number(input.page);
  const status = leadStatuses.find((value) => value === input.status) ?? null;

  return {
    q: (input.q ?? "").trim().slice(0, 80),
    status,
    page: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    sort: input.sort === "asc" ? ("asc" as const) : ("desc" as const),
  };
}
