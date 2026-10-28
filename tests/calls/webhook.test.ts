import { DateTime } from "luxon";
import { afterEach, describe, expect, it } from "vitest";

import { applyCallResult } from "@/lib/calls/applyCallResult";
import { mapEndedReason } from "@/lib/calls/ended-reason";
import { readEndOfCallReport } from "@/lib/calls/end-of-call-report";
import { handleRecordingRequest, placeholderWav, sliceAudio } from "@/lib/calls/recording";
import { extractStructuredFields } from "@/lib/calls/structured-output";
import { handleVapiWebhook, resetWebhookSlots, webhookAuthorized } from "@/lib/calls/webhook";

const now = DateTime.fromISO("2026-10-28T08:00:00.000Z");

afterEach(() => {
  resetWebhookSlots();
});

function report(extra: Record<string, unknown> = {}) {
  return {
    message: {
      type: "end-of-call-report",
      endedReason: "customer-ended-call",
      call: {
        id: "call_123",
        startedAt: "2026-10-28T07:59:00.000Z",
        endedAt: "2026-10-28T08:00:00.000Z",
        customer: { number: "+971501234567" },
      },
      analysis: {
        summary: "Asked about the class.",
        structuredData: { interested: true, interest_level: "high", notes: "Wants Saturday." },
      },
      artifact: {
        transcript: "Assistant: Hi\nCustomer: Yes",
        recording: { url: "https://example.invalid/secret.wav" },
      },
      ...extra,
    },
  };
}

type StoredCall = {
  id: string;
  provider_call_id: string;
  status: string;
  lead: { id: string; attempts: number; phone_e164: string } | null;
  campaign: { owner_id: string; max_attempts: number; retry_delay_minutes: number } | null;
  outcome: string | null;
  recording_ref: string | null;
  raw_payload: unknown;
};

function memoryClient(call: StoredCall) {
  const leads: Record<string, { status: string; callback_at: string | null; next_attempt_at: string | null }> = {};
  if (call.lead) leads[call.lead.id] = { status: "calling", callback_at: null, next_attempt_at: null };
  const dnc: { owner_id: string; phone_e164: string }[] = [];

  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const neqs: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const builder = {
        select() {
          return builder;
        },
        update(value: Record<string, unknown>) {
          patch = value;
          return builder;
        },
        upsert(value: { owner_id: string; phone_e164: string }) {
          if (!dnc.some((row) => row.owner_id === value.owner_id && row.phone_e164 === value.phone_e164)) dnc.push(value);
          return Promise.resolve({ error: null });
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        neq(key: string, value: unknown) {
          neqs[key] = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          if (filters.provider_call_id && call.provider_call_id !== filters.provider_call_id) {
            return Promise.resolve({ data: null, error: null });
          }
          if (filters.id && call.id !== filters.id) return Promise.resolve({ data: null, error: null });
          if (filters.provider_call_id) return Promise.resolve({ data: { id: call.id }, error: null });
          return Promise.resolve({
            data: { id: call.id, status: call.status, leads: call.lead, campaigns: call.campaign },
            error: null,
          });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(finish()).then(resolve, reject);
        },
      };

      function finish() {
        if (patch && table === "calls") {
          if (neqs.status && call.status === neqs.status) return { data: [], error: null };
          call.status = String(patch.status ?? call.status);
          call.outcome = typeof patch.outcome === "string" ? patch.outcome : call.outcome;
          call.recording_ref = typeof patch.recording_ref === "string" ? patch.recording_ref : call.recording_ref;
          if (patch.raw_payload !== undefined) call.raw_payload = patch.raw_payload;
          return { data: [{ id: call.id }], error: null };
        }
        if (patch && table === "leads" && typeof filters.id === "string" && leads[filters.id]) {
          leads[filters.id] = {
            status: String(patch.status),
            callback_at: typeof patch.callback_at === "string" ? patch.callback_at : null,
            next_attempt_at: typeof patch.next_attempt_at === "string" ? patch.next_attempt_at : null,
          };
          return { error: null };
        }
        return { data: null, error: null };
      }

      return builder;
    },
  };

  return { supabase, call, leads, dnc };
}

describe("webhook secret", () => {
  it("accepts the bearer token and the legacy header, and rejects the rest", () => {
    expect(webhookAuthorized(new Headers({ authorization: "Bearer secret-value" }), "secret-value")).toBe(true);
    expect(webhookAuthorized(new Headers({ "x-vapi-secret": "secret-value" }), "secret-value")).toBe(true);
    expect(webhookAuthorized(new Headers({ authorization: "Bearer wrong" }), "secret-value")).toBe(false);
    expect(webhookAuthorized(new Headers(), "secret-value")).toBe(false);
  });
});

describe("end-of-call report", () => {
  it("reads both structured-data locations and drops recording urls", () => {
    const older = readEndOfCallReport(report());
    expect(older?.result.structuredData).toMatchObject({
      interested: true,
      interest_level: "high",
      notes: "Wants Saturday.",
    });
    expect(older?.recordingRef).toBe("vapi:call_123");
    expect(JSON.stringify(older?.result.rawPayload)).not.toContain("+971501234567");
    expect(JSON.stringify(older?.result.rawPayload)).not.toContain("secret.wav");

    const newer = extractStructuredFields({
      message: {
        artifact: {
          structuredOutputs: {
            "out-1": {
              name: "Call outcome",
              result: {
                interested: false,
                do_not_call: true,
                callback_requested: false,
                notes: "Stop calling.",
              },
            },
          },
        },
      },
    });
    expect(newer.do_not_call).toBe(true);
    expect(newer.notes).toBe("Stop calling.");
    expect(extractStructuredFields({ message: { type: "end-of-call-report" } }).interested).toBeNull();
    expect(readEndOfCallReport({ message: { type: "status-update" } })).toBeNull();
    expect(readEndOfCallReport({ nope: true })).toBeNull();
  });

  it("maps ended reasons, including unknown ones", () => {
    expect(mapEndedReason("customer-did-not-answer")).toBe("no_answer");
    expect(mapEndedReason("customer-busy")).toBe("no_answer");
    expect(mapEndedReason("voicemail")).toBe("voicemail");
    expect(mapEndedReason("customer-ended-call")).toBe("completed");
    expect(mapEndedReason("customer-ended-call-before-warm-transfer")).toBe("completed");
    expect(mapEndedReason("pipeline-error-openai-voice-failed")).toBe("failed");
    expect(mapEndedReason("assistant-not-found")).toBe("failed");
    expect(mapEndedReason("something-new")).toBe("failed");
    expect(mapEndedReason("")).toBe("failed");
  });
});

describe("webhook handling", () => {
  const headers = new Headers({ authorization: "Bearer secret-value" });

  function stored(partial?: Partial<StoredCall>): StoredCall {
    return {
      id: "row-1",
      provider_call_id: "call_123",
      status: "in_progress",
      lead: { id: "lead-1", attempts: 1, phone_e164: "+971501234567" },
      campaign: { owner_id: "owner-1", max_attempts: 3, retry_delay_minutes: 120 },
      outcome: null,
      recording_ref: null,
      raw_payload: null,
      ...partial,
    };
  }

  it("updates a call once and ignores the replay", async () => {
    const db = memoryClient(stored());
    const payload = report();
    const first = await handleVapiWebhook({
      headers,
      payload,
      secret: "secret-value",
      supabase: db.supabase as never,
      now,
    });
    expect(first.status).toBe(200);
    expect(db.call.status).toBe("ended");
    expect(db.call.outcome).toBe("interested");
    expect(db.leads["lead-1"]?.status).toBe("interested");
    expect(db.call.recording_ref).toBe("vapi:call_123");

    const second = await handleVapiWebhook({
      headers,
      payload,
      secret: "secret-value",
      supabase: db.supabase as never,
      now,
    });
    expect(second.status).toBe(200);
    expect(db.call.outcome).toBe("interested");
    expect(db.leads["lead-1"]?.status).toBe("interested");
  });

  it("returns 200 for an unknown call and still updates a test call with no lead", async () => {
    const missing = memoryClient(stored({ provider_call_id: "other" }));
    const unknown = await handleVapiWebhook({
      headers,
      payload: report(),
      secret: "secret-value",
      supabase: missing.supabase as never,
      now,
    });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ unknown: true });
    expect(missing.call.status).toBe("in_progress");

    const testCall = memoryClient(stored({ lead: null, campaign: stored().campaign }));
    const response = await handleVapiWebhook({
      headers,
      payload: report(),
      secret: "secret-value",
      supabase: testCall.supabase as never,
      now,
    });
    expect(response.status).toBe(200);
    expect(testCall.call.status).toBe("ended");
    expect(testCall.dnc).toHaveLength(0);
  });

  it("adds a do-not-call number and falls back when the callback time is unparseable", async () => {
    const dnc = memoryClient(stored());
    await handleVapiWebhook({
      headers,
      payload: report({
        analysis: { structuredData: { do_not_call: true, notes: "Stop." } },
      }),
      secret: "secret-value",
      supabase: dnc.supabase as never,
      now,
    });
    expect(dnc.leads["lead-1"]?.status).toBe("do_not_call");
    expect(dnc.dnc).toEqual([{ owner_id: "owner-1", phone_e164: "+971501234567" }]);

    const callback = memoryClient(stored({ provider_call_id: "call_123" }));
    await applyCallResult(
      callback.supabase as never,
      "row-1",
      {
        outcome: "callback",
        structuredData: { callback_requested: true, callback_time: "tomorrow" },
      },
      now,
    );
    expect(callback.leads["lead-1"]?.status).toBe("callback");
    expect(callback.leads["lead-1"]?.callback_at).toBe("2026-10-29T08:00:00.000Z");
  });

  it("rejects a missing or wrong secret and ignores other message types", async () => {
    const db = memoryClient(stored());
    const wrong = await handleVapiWebhook({
      headers: new Headers({ authorization: "Bearer no" }),
      payload: report(),
      secret: "secret-value",
      supabase: db.supabase as never,
    });
    const missing = await handleVapiWebhook({
      headers: new Headers(),
      payload: report(),
      secret: "secret-value",
      supabase: db.supabase as never,
    });
    const ignored = await handleVapiWebhook({
      headers,
      payload: { message: { type: "transcript", transcript: "hello" } },
      secret: "secret-value",
      supabase: db.supabase as never,
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toMatchObject({ ignored: true });
    expect(db.call.status).toBe("in_progress");
  });
});

describe("recording route", () => {
  const owner = { ownerId: "owner-1", recordingRef: null, providerCallId: "call_123" };

  it("rejects anonymous users, other owners, and calls with no recording", async () => {
    expect((await handleRecordingRequest({ userId: null, call: owner, range: null, mode: "mock" })).status).toBe(401);
    expect(
      (await handleRecordingRequest({ userId: "owner-2", call: owner, range: null, mode: "live" })).status,
    ).toBe(404);
    expect((await handleRecordingRequest({ userId: "owner-1", call: null, range: null, mode: "live" })).status).toBe(404);
    const empty = await handleRecordingRequest({ userId: "owner-1", call: owner, range: null, mode: "mock" });
    expect(empty.status).toBe(404);
    expect(await empty.json()).toMatchObject({ error: "No recording in mock mode." });
  });

  it("streams a generated wav and honors a range request in mock mode", async () => {
    const response = await handleRecordingRequest({
      userId: "owner-1",
      call: { ...owner, recordingRef: "vapi:mock_1", providerCallId: "mock_1" },
      range: null,
      mode: "mock",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    const ranged = sliceAudio(placeholderWav(), "bytes=0-3");
    expect(ranged.status).toBe(206);
    expect(ranged.body).toHaveLength(4);
  });
});
