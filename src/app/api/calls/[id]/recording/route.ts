import { connection } from "next/server";
import { z } from "zod";

import { handleRecordingRequest, streamVapiMonoRecording } from "@/lib/calls/recording";
import { voiceProviderMode } from "@/lib/providers/mode";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const loaded = await supabase
    .from("calls")
    .select("recording_ref, provider_call_id, campaigns!inner(owner_id)")
    .eq("id", id)
    .eq("campaigns.owner_id", userId)
    .maybeSingle();

  const campaign = Array.isArray(loaded.data?.campaigns) ? loaded.data?.campaigns[0] : loaded.data?.campaigns;
  const call = loaded.data
    ? {
        ownerId: String(campaign?.owner_id ?? ""),
        recordingRef: typeof loaded.data.recording_ref === "string" ? loaded.data.recording_ref : null,
        providerCallId: typeof loaded.data.provider_call_id === "string" ? loaded.data.provider_call_id : null,
      }
    : null;

  const apiKey = process.env.VAPI_API_KEY;
  return handleRecordingRequest({
    userId,
    call,
    range: request.headers.get("range"),
    mode: voiceProviderMode(),
    fetchLive:
      apiKey && voiceProviderMode() === "live"
        ? (providerCallId, range) => streamVapiMonoRecording(providerCallId, range, apiKey)
        : undefined,
  });
}
