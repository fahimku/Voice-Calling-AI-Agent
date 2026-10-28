"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addLead } from "@/app/(app)/campaigns/[id]/leads/actions";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddLeadForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addLead.bind(null, campaignId), {});

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
    if (state.ok) {
      toast.success("Lead added.", { id: "lead-added" });
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <Field label="Name" htmlFor="lead-name" error={state.fieldErrors?.name}>
        <Input id="lead-name" name="name" placeholder="Optional" className="h-10" />
      </Field>
      <Field label="Phone" htmlFor="lead-phone" error={state.fieldErrors?.phone}>
        <Input id="lead-phone" name="phone" placeholder="0501234567" className="h-10" required />
      </Field>
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Adding…" : "Add lead"}
      </Button>
    </form>
  );
}
