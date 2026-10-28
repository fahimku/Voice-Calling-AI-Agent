import { connection } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  await connection();
  try {
    const admin = createAdminClient();
    const result = await admin.from("campaigns").select("id", { head: true, count: "exact" }).limit(1);
    if (result.error) return Response.json({ ok: false, db: false }, { status: 503 });
    return Response.json({ ok: true, db: true });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
