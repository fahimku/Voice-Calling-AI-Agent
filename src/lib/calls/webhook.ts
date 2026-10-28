import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { applyCallResult } from "@/lib/calls/applyCallResult";
import { parseWebhookEnvelope, readEndOfCallReport } from "@/lib/calls/end-of-call-report";
import { secretsMatch } from "@/lib/scheduler/secret";

const hits: number[] = [];

export function takeWebhookSlot(nowMs: number, limit = 120, windowMs = 60_000) {
  while (hits.length > 0 && hits[0] != null && nowMs - hits[0] >= windowMs) hits.shift();
  if (hits.length >= limit) return false;
  hits.push(nowMs);
  return true;
}

export function resetWebhookSlots() {
  hits.length = 0;
}

export function providedWebhookSecret(headers: Headers) {
  const authorization = headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1] ?? "";
  const legacy = headers.get("x-vapi-secret") ?? "";
  return { bearer, legacy };
}

export function webhookAuthorized(headers: Headers, expected: string) {
  const { bearer, legacy } = providedWebhookSecret(headers);
  const bearerMatch = bearer ? secretsMatch(bearer, expected) : false;
  const legacyMatch = legacy ? secretsMatch(legacy, expected) : false;
  if (!bearer && !legacy) secretsMatch("missing", expected);
  return bearerMatch || legacyMatch;
}

export async function handleVapiWebhook(input: {
  headers: Headers;
  payload: unknown;
  secret: string | undefined;
  nowMs?: number;
  supabase: SupabaseClient;
  now?: DateTime;
}) {
  if (!takeWebhookSlot(input.nowMs ?? Date.now())) {
    return Response.json({ error: "Too many webhook requests." }, { status: 429 });
  }
  if (!input.secret) {
    return Response.json({ error: "Webhook secret is not configured." }, { status: 500 });
  }
  if (!webhookAuthorized(input.headers, input.secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const envelope = parseWebhookEnvelope(input.payload);
  if (!envelope) return Response.json({ ok: true, ignored: true });
  if (envelope.type !== "end-of-call-report") return Response.json({ ok: true, ignored: true });

  const report = readEndOfCallReport(input.payload);
  if (!report?.providerCallId) return Response.json({ ok: true, ignored: true });

  const found = await input.supabase
    .from("calls")
    .select("id")
    .eq("provider_call_id", report.providerCallId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (found.error || !found.data?.id) {
    console.warn("End-of-call report did not match a stored call.");
    return Response.json({ ok: true, unknown: true });
  }

  await applyCallResult(input.supabase, String(found.data.id), report.result, input.now ?? DateTime.utc());
  return Response.json({ ok: true });
}
