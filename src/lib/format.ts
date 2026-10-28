import { DateTime } from "luxon";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const weekdays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

export function formatCreated(value: string) {
  const date = DateTime.fromISO(value, { zone: "utc" }).setZone("Asia/Dubai");
  if (!date.isValid) return "—";
  return date.toFormat("d LLL yyyy");
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = DateTime.fromISO(value, { zone: "utc" }).setZone("Asia/Dubai");
  if (!date.isValid) return "—";
  return date.toFormat("d LLL yyyy, HH:mm");
}

export function shortenId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function formatWindow(start: string, end: string) {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export function formatActiveDays(days: number[]) {
  const sorted = [...days].sort((left, right) => left - right);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5") return "Mon–Fri";
  if (key === "1,2,3,4,5,6,7") return "Every day";
  return sorted.map((day) => dayLabels[day - 1]).filter(Boolean).join(", ");
}

export function formatTimeInput(value: string) {
  return value.slice(0, 5);
}
