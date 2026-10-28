import { z } from "zod";

export const testCallSchema = z.object({
  phone: z.string().trim().min(1, "Enter a phone number.").max(40, "Phone number is too long."),
  name: z.string().trim().max(120, "Name must be 120 characters or fewer."),
});

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export function parseTestCallForm(formData: FormData) {
  return testCallSchema.safeParse({
    phone: text(formData.get("phone")),
    name: text(formData.get("name")),
  });
}
