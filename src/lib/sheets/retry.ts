const maxStoredError = 300;

export function sheetsErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  if (typeof record.response?.status === "number") return record.response.status;
  if (typeof record.status === "number") return record.status;
  if (typeof record.code === "number") return record.code;
  if (typeof record.code === "string" && /^\d{3}$/.test(record.code)) return Number(record.code);
  return null;
}

export function isRetryableSheetsStatus(status: number | null) {
  return status === 429 || (status != null && status >= 500 && status < 600);
}

export async function withSheetsRetry<T>(
  run: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> },
) {
  const attempts = options?.attempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 200;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const retry = isRetryableSheetsStatus(sheetsErrorStatus(error));
      if (!retry || attempt === attempts - 1) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw last;
}

export function publicSheetError(error: unknown, secrets: string[] = []) {
  const raw = error instanceof Error ? error.message : "Google Sheets request failed.";
  let text = raw.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted]");
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length < 8) continue;
    text = text.split(trimmed).join("[redacted]");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) text = "Google Sheets request failed.";
  return text.slice(0, maxStoredError);
}
