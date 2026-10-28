"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { setCampaignStatus } from "@/app/(app)/campaigns/actions";
import type { CampaignStatus } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";

function StatusButton({
  intent,
  children,
  disabled,
}: {
  intent: string;
  children: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  const active = pending && data?.get("intent") === intent;

  return (
    <Button type="submit" name="intent" value={intent} disabled={disabled || pending}>
      {active ? "Saving…" : children}
    </Button>
  );
}

export function StatusActions({
  campaignId,
  status,
  startBlocker,
}: {
  campaignId: string;
  status: CampaignStatus;
  startBlocker: string | null;
}) {
  const [state, action] = useActionState(setCampaignStatus.bind(null, campaignId), {});

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
  }, [state]);

  if (status === "completed") {
    return (
      <div className="flex flex-col gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <StatusButton intent="reopen">Reopen</StatusButton>
          <p className="text-sm text-muted-foreground">Reopen moves this campaign to paused.</p>
        </form>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <StatusButton intent="start" disabled={Boolean(startBlocker)}>
            Start
          </StatusButton>
        ) : null}
        {status === "active" ? <StatusButton intent="pause">Pause</StatusButton> : null}
        {status === "paused" ? <StatusButton intent="resume">Resume</StatusButton> : null}
        <StatusButton intent="complete">Mark completed</StatusButton>
      </form>
      {status === "draft" && startBlocker ? (
        <p className="text-sm text-muted-foreground">{startBlocker}</p>
      ) : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </div>
  );
}
