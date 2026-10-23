import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/lib/campaigns";

const labels: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

const variants: Record<CampaignStatus, "default" | "secondary" | "outline" | "ghost"> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
  completed: "ghost",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}
