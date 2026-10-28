import { DateTime } from "luxon";

export const mockReconcileAfterMs = 60_000;
export const liveReconcileAfterMs = 5 * 60 * 1000;
export const stuckCallAfterMs = 15 * 60 * 1000;

export type ReconcileAction = "wait" | "poll" | "timeout";

export function callAgeMs(startedAt: string | null, now: DateTime) {
  if (!startedAt) return null;
  const started = DateTime.fromISO(startedAt, { zone: "utc" });
  if (!started.isValid) return null;
  return now.toMillis() - started.toMillis();
}

export function reconcileAction(
  call: { status: string; startedAt: string | null },
  now: DateTime,
  mode: "mock" | "live",
): ReconcileAction {
  if (call.status !== "in_progress") return "wait";
  const age = callAgeMs(call.startedAt, now);
  if (age == null || age < 0) return "wait";
  if (mode === "live" && age >= liveReconcileAfterMs) return "poll";
  if (age >= stuckCallAfterMs) return "timeout";
  if (mode === "mock" && age >= mockReconcileAfterMs) return "poll";
  return "wait";
}
