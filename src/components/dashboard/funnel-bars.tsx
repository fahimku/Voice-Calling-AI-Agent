import { funnelSteps, type FunnelCounts } from "@/lib/dashboard/aggregate";

export function FunnelBars({ counts }: { counts: FunnelCounts }) {
  const steps = funnelSteps(counts);
  const width = Math.max(steps[0]?.value ?? 0, 1);

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step) => (
        <li key={step.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{step.label}</span>
            <span className="font-medium tabular-nums">{step.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.round((step.value / width) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
