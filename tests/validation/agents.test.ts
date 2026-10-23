import { describe, expect, it } from "vitest";

import { agentSchema } from "@/lib/validation/agents";

const validAgent = {
  name: "Tuition desk",
  businessType: "tuition",
  providerAssistantId: "asst_12345678",
  providerPhoneNumberId: "",
  notes: "",
};

describe("agentSchema", () => {
  it("accepts an agent without a phone number ID", () => {
    expect(agentSchema.safeParse(validAgent).success).toBe(true);
  });

  it("accepts each business type and optional notes", () => {
    for (const businessType of ["tuition", "real_estate", "other"] as const) {
      const parsed = agentSchema.safeParse({
        ...validAgent,
        businessType,
        providerPhoneNumberId: "ph_123",
        notes: "Calls in English.",
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects a blank name", () => {
    const parsed = agentSchema.safeParse({ ...validAgent, name: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Enter a name.");
    }
  });

  it("rejects a missing assistant ID", () => {
    const parsed = agentSchema.safeParse({ ...validAgent, providerAssistantId: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === "Enter the Vapi assistant ID.")).toBe(
        true,
      );
    }
  });

  it("rejects an unknown business type", () => {
    const parsed = agentSchema.safeParse({ ...validAgent, businessType: "clinic" });
    expect(parsed.success).toBe(false);
  });
});
