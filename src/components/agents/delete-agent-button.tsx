"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { deleteAgent } from "@/app/(app)/agents/actions";
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

export function DeleteAgentButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteAgent.bind(null, id), {});
  const formId = `delete-agent-${id}`;

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
              This removes the agent. You cannot delete an agent that a campaign still uses.
            </DialogDescription>
          </DialogHeader>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" form={formId} variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
