"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { deleteCampaign } from "@/app/(app)/campaigns/actions";
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

export function DeleteCampaignButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteCampaign.bind(null, id), {});
  const formId = `delete-campaign-${id}`;

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
  }, [state]);

  return (
    <>
      <form id={formId} action={action} />
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Delete</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the campaign. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" form={formId} variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
