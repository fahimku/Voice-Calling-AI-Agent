"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { chartOutcomeLabels, chartOutcomes, type ChartOutcome } from "@/lib/dashboard/aggregate";

const colors: Record<ChartOutcome, string> = {
  interested: "#0f766e",
  not_interested: "#64748b",
  no_answer: "#d97706",
  voicemail: "#7c3aed",
  failed: "#b91c1c",
};

export function CallsChart({
  series,
}: {
  series: Array<{ day: string; label: string } & Record<ChartOutcome, number>>;
}) {
  const total = series.reduce(
    (sum, point) => sum + chartOutcomes.reduce((day, outcome) => day + point[outcome], 0),
    0,
  );
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No calls in the last 14 days.</p>;
  }

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {chartOutcomes.map((outcome) => (
            <Bar key={outcome} dataKey={outcome} name={chartOutcomeLabels[outcome]} stackId="calls" fill={colors[outcome]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
