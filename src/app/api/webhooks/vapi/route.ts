import { DateTime } from "luxon";
import { after, connection } from "next/server";

import { handleVapiWebhook } from "@/lib/calls/webhook";
import { syncCampaignNow } from "@/lib/sheets/run";
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
    let campaignId: string | null = null;
    const response = await handleVapiWebhook({
      headers: request.headers,
      payload,
      secret: process.env.VAPI_WEBHOOK_SECRET,
      supabase: createAdminClient(),
      now: DateTime.utc(),
      onApplied(info) {
        campaignId = info.campaignId;
      },
    });
    if (campaignId) {
      const id = campaignId;
      after(async () => {
        try {
          await syncCampaignNow(createAdminClient(), id);
        } catch {
          // sheet_dirty stays set so the scheduler tick can retry.
        }
      });
    }
    return response;
  } catch {
    return Response.json({ ok: true, ignored: true });
  }
}
