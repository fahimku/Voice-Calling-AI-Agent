import { DateTime } from "luxon";
import { connection } from "next/server";

import { executeActiveTicks } from "@/lib/scheduler/execute";
import { secretsMatch, takeTickSlot } from "@/lib/scheduler/secret";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  await connection();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!takeTickSlot(Date.now())) {
    return Response.json({ error: "The scheduler just ran. Wait a few seconds." }, { status: 429 });
  }

  try {
    const campaigns = await executeActiveTicks(createAdminClient(), DateTime.utc());
    return Response.json({ campaigns });
  } catch {
    return Response.json({ error: "Could not run the scheduler." }, { status: 500 });
  }
}
