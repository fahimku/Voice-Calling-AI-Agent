import { DateTime } from "luxon";

export const mockReconcileAfterMs = 60_000;
export const stuckCallAfterMs = 15 * 60 * 1000;

export type ReconcileAction = "wait" | "poll" | "timeout";

export function reconcileAction(
  call: { status: string; startedAt: string | null },
  now: DateTime,
  mode: "mock" | "live",
): ReconcileAction {
  if (call.status !== "in_progress" || !call.startedAt) return "wait";
  const started = DateTime.fromISO(call.startedAt, { zone: "utc" });
  if (!started.isValid) return "wait";
  const age = now.toMillis() - started.toMillis();
  if (age >= stuckCallAfterMs) return "timeout";
  if (mode === "mock" && age >= mockReconcileAfterMs) return "poll";
  return "wait";
}
