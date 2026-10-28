import Link from "next/link";

import { cn } from "@/lib/utils";

export function CampaignSectionNav({
  campaignId,
  current,
}: {
  campaignId: string;
  current: "settings" | "leads" | "calls";
}) {
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex w-fit gap-1 rounded-xl border p-1">
      {item(`/campaigns/${campaignId}`, "Settings", current === "settings")}
      {item(`/campaigns/${campaignId}/leads`, "Leads", current === "leads")}
      {item(`/campaigns/${campaignId}/calls`, "Calls", current === "calls")}
    </nav>
  );
}
