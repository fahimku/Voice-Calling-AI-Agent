import { z } from "zod";

export const businessTypes = ["tuition", "real_estate", "other"] as const;

export const businessTypeLabels: Record<(typeof businessTypes)[number], string> = {
  tuition: "Tuition",
  real_estate: "Real estate",
  other: "Other",
};

const reservedVariableKeys = new Set(["customer_name", "agent_name", "business_name"]);

const agentVariableSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Enter a variable name.")
    .max(40, "Variable names must be 40 characters or fewer.")
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "Variable names use letters, numbers, and underscores, and start with a letter.",
    ),
  value: z.string().trim().max(2000, "Variable values must be 2,000 characters or fewer."),
});

export type AgentVariable = z.infer<typeof agentVariableSchema>;

const agentObjectSchema = z.object({
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
  agentDisplayName: z
    .string()
    .trim()
    .max(80, "Spoken name must be 80 characters or fewer.")
    .default(""),
  businessName: z
    .string()
    .trim()
    .max(120, "Business name must be 120 characters or fewer.")
    .default(""),
  variables: z
    .array(agentVariableSchema)
    .max(20, "Use 20 prompt variables or fewer.")
    .default([]),
});

export const agentSchema = agentObjectSchema.superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (const row of data.variables) {
    const key = row.key.toLowerCase();
    if (reservedVariableKeys.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: "customer_name, agent_name, and business_name are filled in automatically.",
        path: ["variables"],
      });
      return;
    }
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: "Variable names must be unique.",
        path: ["variables"],
      });
      return;
    }
    seen.add(key);
  }
});

export type AgentInput = z.infer<typeof agentSchema>;

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function filledVariableRow(row: unknown) {
  if (!row || typeof row !== "object") return true;
  const key = "key" in row && typeof row.key === "string" ? row.key.trim() : "";
  const value = "value" in row && typeof row.value === "string" ? row.value.trim() : "";
  return key.length > 0 || value.length > 0;
}

export function variablesRecord(rows: AgentVariable[]) {
  const record: Record<string, string> = {};
  for (const row of rows) record[row.key] = row.value;
  return record;
}

export function variableEntries(value: unknown): AgentVariable[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return [];
    const textValue = typeof entry === "string" ? entry : "";
    if (!textValue && typeof entry !== "string") return [];
    return [{ key, value: textValue }];
  });
}

export function parseAgentForm(formData: FormData) {
  const rawVariables = text(formData.get("variablesJson"));
  let variables: unknown = [];
  if (rawVariables.trim()) {
    try {
      const parsed = JSON.parse(rawVariables) as unknown;
      variables = Array.isArray(parsed) ? parsed.filter(filledVariableRow) : parsed;
    } catch {
      variables = [{ key: "", value: rawVariables }];
    }
  }

  return agentSchema.safeParse({
    name: text(formData.get("name")),
    businessType: text(formData.get("businessType")),
    providerAssistantId: text(formData.get("providerAssistantId")),
    providerPhoneNumberId: text(formData.get("providerPhoneNumberId")),
    notes: text(formData.get("notes")),
    agentDisplayName: text(formData.get("agentDisplayName")),
    businessName: text(formData.get("businessName")),
    variables,
  });
}
