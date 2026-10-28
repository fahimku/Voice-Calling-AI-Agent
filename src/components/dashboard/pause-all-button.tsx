"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { pauseAllCampaigns } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";

export function PauseAllButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function pause() {
    if (!window.confirm("Pause every active campaign?")) return;
    setPending(true);
    const result = await pauseAllCampaigns();
    setPending(false);
    if (result.error) {
      toast.error(result.error, { id: "pause-all" });
      return;
    }
    toast.success(
      result.paused > 0
        ? `Paused ${result.paused} campaign${result.paused === 1 ? "" : "s"}.`
        : "No active campaigns to pause.",
      { id: "pause-all" },
    );
    router.refresh();
  }

  return (
    <Button type="button" variant="destructive" onClick={() => void pause()} disabled={pending}>
      {pending ? "Pausing…" : "Pause all campaigns"}
    </Button>
  );
}
