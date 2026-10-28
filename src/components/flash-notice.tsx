"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const notices: Record<string, string> = {
  "agent-created": "Agent created.",
  "agent-updated": "Agent updated.",
  "agent-deleted": "Agent deleted.",
  "campaign-created": "Campaign created.",
  "campaign-updated": "Campaign updated.",
  "campaign-deleted": "Campaign deleted.",
  "campaign-start": "Campaign started.",
  "campaign-pause": "Campaign paused.",
  "campaign-resume": "Campaign resumed.",
  "campaign-complete": "Campaign marked completed.",
  "campaign-reopen": "Campaign reopened and paused.",
};

export function FlashNotice({ notice }: { notice?: string }) {
  useEffect(() => {
    if (!notice) return;
    const message = notices[notice];
    if (message) toast.success(message, { id: notice });

    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [notice]);

  return null;
}
