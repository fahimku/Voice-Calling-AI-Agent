import { DateTime } from "luxon";
import { connection } from "next/server";

import { executeActiveTicks } from "@/lib/scheduler/execute";
import { authorizeCron, takeTickSlot } from "@/lib/scheduler/secret";
import { syncAllConnected } from "@/lib/sheets/run";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await connection();
  const decision = authorizeCron(process.env.CRON_SECRET, request.headers.get("x-cron-secret"));
  if (!decision.ok) {
    return Response.json({ error: decision.error }, { status: decision.status });
  }

  if (!takeTickSlot(Date.now())) {
    return Response.json({ error: "The scheduler just ran. Wait a few seconds." }, { status: 429 });
  }

  try {
    const admin = createAdminClient();
    const campaigns = await executeActiveTicks(admin, DateTime.utc());
    let sheetSync: Array<{ campaignId: string; ok: boolean; error?: string }> = [];
    try {
      sheetSync = await syncAllConnected(admin);
    } catch {
      sheetSync = [];
    }
    return Response.json({ campaigns, sheetSync });
  } catch {
    return Response.json({ error: "Could not run the scheduler." }, { status: 500 });
  }
}
