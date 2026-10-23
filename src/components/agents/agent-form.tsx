"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/lib/validation/errors";
import { businessTypeLabels, businessTypes } from "@/lib/validation/agents";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AgentFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  values?: {
    name: string;
    businessType: string;
    providerAssistantId: string;
    providerPhoneNumberId: string;
    notes: string;
  };
};

function businessTypeLabel(value: unknown) {
  if (value === "tuition" || value === "real_estate" || value === "other") {
    return businessTypeLabels[value];
  }
  return "Choose a type";
}

export function AgentForm({ action, submitLabel, values }: AgentFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState(values?.name ?? "");
  const [businessType, setBusinessType] = useState(values?.businessType ?? "");
  const [assistantId, setAssistantId] = useState(values?.providerAssistantId ?? "");
  const [phoneId, setPhoneId] = useState(values?.providerPhoneNumberId ?? "");
  const [notes, setNotes] = useState(values?.notes ?? "");

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10"
          required
        />
      </Field>
      <Field label="Business type" htmlFor="businessType" error={state.fieldErrors?.businessType}>
        <input type="hidden" name="businessType" value={businessType} />
        <Select
          value={businessType || null}
          onValueChange={(value) => setBusinessType(value ?? "")}
        >
          <SelectTrigger id="businessType" className="h-10 w-full">
            <SelectValue placeholder="Choose a type">
              {(value) => businessTypeLabel(value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {businessTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {businessTypeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Vapi assistant ID"
        htmlFor="providerAssistantId"
        error={state.fieldErrors?.providerAssistantId}
      >
        <Input
          id="providerAssistantId"
          name="providerAssistantId"
          value={assistantId}
          onChange={(event) => setAssistantId(event.target.value)}
          className="h-10"
          required
        />
      </Field>
      <Field
        label="Vapi phone number ID"
        htmlFor="providerPhoneNumberId"
        error={state.fieldErrors?.providerPhoneNumberId}
      >
        <Input
          id="providerPhoneNumberId"
          name="providerPhoneNumberId"
          value={phoneId}
          onChange={(event) => setPhoneId(event.target.value)}
          placeholder="Optional for now"
          className="h-10"
        />
      </Field>
      <Field label="Notes" htmlFor="notes" error={state.fieldErrors?.notes}>
        <Textarea
          id="notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
