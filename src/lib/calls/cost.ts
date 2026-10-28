function roundCost(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numericCost(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return roundCost(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return roundCost(parsed);
  }
  return null;
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sumCosts(value: unknown) {
  if (!Array.isArray(value)) return null;
  let sum = 0;
  let found = false;
  for (const item of value) {
    const row = objectValue(item);
    const cost = numericCost(row?.cost);
    if (cost == null) continue;
    sum += cost;
    found = true;
  }
  return found ? roundCost(sum) : null;
}

export function extractCallCost(message: Record<string, unknown>, call: Record<string, unknown> | null) {
  return numericCost(message.cost) ?? numericCost(call?.cost) ?? sumCosts(message.costs) ?? sumCosts(call?.costs);
}
