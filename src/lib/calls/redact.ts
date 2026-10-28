const sensitiveKey = /phone|e164|number|apikey|api_key|secret|token|authorization|password|recording|url/i;
const phonePattern = /\+[1-9]\d{6,14}/g;

function redactString(value: string) {
  return value.replace(phonePattern, (phone) => {
    const tail = phone.slice(-4);
    return `+***${tail}`;
  });
}

export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return redactString(value).slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactPayload(entry, depth + 1));
  if (typeof value !== "object") return null;

  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 80)) {
    if (sensitiveKey.test(key)) {
      copy[key] = "[redacted]";
      continue;
    }
    copy[key] = redactPayload(entry, depth + 1);
  }
  return copy;
}
