import { z } from "zod";

export const businessTypes = ["tuition", "real_estate", "other"] as const;

export const businessTypeLabels: Record<(typeof businessTypes)[number], string> = {
  tuition: "Tuition",
  real_estate: "Real estate",
  other: "Other",
};

export const agentSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120, "Name must be 120 characters or fewer."),
  businessType: z.enum(businessTypes, { error: "Choose a business type." }),
  providerAssistantId: z
    .string()
    .trim()
    .min(1, "Enter the Vapi assistant ID.")
    .max(200, "Assistant ID must be 200 characters or fewer."),
  providerPhoneNumberId: z
    .string()
    .trim()
    .max(200, "Phone number ID must be 200 characters or fewer."),
  notes: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer."),
});

export type AgentInput = z.infer<typeof agentSchema>;

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export function parseAgentForm(formData: FormData) {
  return agentSchema.safeParse({
    name: text(formData.get("name")),
    businessType: text(formData.get("businessType")),
    providerAssistantId: text(formData.get("providerAssistantId")),
    providerPhoneNumberId: text(formData.get("providerPhoneNumberId")),
    notes: text(formData.get("notes")),
  });
}
