import { timingSafeEqual } from "node:crypto";

export function secretsMatch(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

let lastTickAt = 0;

export function takeTickSlot(nowMs: number, gapMs = 5_000) {
  if (nowMs - lastTickAt < gapMs) return false;
  lastTickAt = nowMs;
  return true;
}

export function resetTickSlot() {
  lastTickAt = 0;
}
