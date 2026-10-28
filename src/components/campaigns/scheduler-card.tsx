import { RunSchedulerButton } from "@/components/campaigns/run-scheduler-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchedulerSnapshot } from "@/lib/scheduler/snapshot";

export function SchedulerCard({
  campaignId,
  snapshot,
}: {
  campaignId: string;
  snapshot: SchedulerSnapshot;
}) {
  if (!snapshot.ok) {
    return <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{snapshot.message}</p>;
  }

  const width = snapshot.limit > 0 ? Math.min(100, Math.round((snapshot.usedToday / snapshot.limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s calls used / daily limit</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-2xl font-semibold tracking-tight">
          {snapshot.usedToday} / {snapshot.limit}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={snapshot.limit}
          aria-valuenow={snapshot.usedToday}
          aria-label="Today's calls used"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${width}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">In progress: {snapshot.inProgress}</p>
        <p className="text-sm text-muted-foreground">Next eligible leads: {snapshot.eligible}</p>
        <p className="text-sm">{snapshot.statusLine}</p>
        <RunSchedulerButton campaignId={campaignId} />
      </CardContent>
    </Card>
  );
}
