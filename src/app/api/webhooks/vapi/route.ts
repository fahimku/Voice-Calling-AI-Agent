import { DateTime } from "luxon";
import { connection } from "next/server";

import { handleVapiWebhook } from "@/lib/calls/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await connection();
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  try {
    return await handleVapiWebhook({
      headers: request.headers,
      payload,
      secret: process.env.VAPI_WEBHOOK_SECRET,
      supabase: createAdminClient(),
      now: DateTime.utc(),
    });
  } catch {
    return Response.json({ ok: true, ignored: true });
  }
}
