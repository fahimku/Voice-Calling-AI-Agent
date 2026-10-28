"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { runSchedulerNow } from "@/app/(app)/campaigns/scheduler-actions";
import { Button } from "@/components/ui/button";

export function RunSchedulerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await runSchedulerNow(campaignId);
        setPending(false);
        if ("error" in result && result.error) {
          toast.error(result.error, { id: "scheduler-error" });
          return;
        }
        if ("message" in result && result.message) {
          toast.message(result.message, { id: "scheduler-result" });
        }
        router.refresh();
      }}
    >
      {pending ? "Running…" : "Run scheduler now"}
    </Button>
  );
}
