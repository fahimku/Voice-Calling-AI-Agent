import type { z } from "zod";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function fieldErrorsFromZod(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}

export function invalidFormState(error: z.ZodError): ActionState {
  return {
    error: "Check the form and try again.",
    fieldErrors: fieldErrorsFromZod(error),
  };
}
