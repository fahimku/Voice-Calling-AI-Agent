"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteLead } from "@/app/(app)/campaigns/[id]/leads/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteLeadButton({
  campaignId,
  leadId,
  name,
}: {
  campaignId: string;
  leadId: string;
  name: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteLead.bind(null, campaignId, leadId), {});
  const formId = `delete-lead-${leadId}`;

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
    if (state.ok) {
      toast.success("Lead deleted.", { id: `lead-deleted-${leadId}` });
      router.refresh();
    }
  }, [leadId, router, state]);

  return (
    <>
      <form id={formId} action={action} />
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Delete</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>This removes the lead from the campaign.</DialogDescription>
          </DialogHeader>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" form={formId} variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
