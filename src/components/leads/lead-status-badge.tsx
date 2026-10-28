import { Badge } from "@/components/ui/badge";
import { leadStatusLabels, type LeadStatus } from "@/lib/validation/leads";

const variants: Record<LeadStatus, "default" | "secondary" | "outline" | "destructive" | "ghost"> = {
  pending: "secondary",
  calling: "default",
  no_answer: "outline",
  voicemail: "outline",
  interested: "default",
  not_interested: "ghost",
  callback: "outline",
  do_not_call: "destructive",
  failed: "destructive",
  completed: "ghost",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={variants[status]}>{leadStatusLabels[status]}</Badge>;
}
