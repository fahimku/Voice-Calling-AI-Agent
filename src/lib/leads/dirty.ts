import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumn } from "@/lib/db-error";

export async function updateLeadPreservingSync(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
  onlyIfStatus?: string,
) {
  const run = (patch: Record<string, unknown>) => {
    let query = supabase.from("leads").update(patch).eq("id", id);
    if (onlyIfStatus) query = query.eq("status", onlyIfStatus);
    return query;
  };
  const first = await run({ ...fields, sheet_dirty: true });
  if (first.error && isMissingColumn(first.error)) return run(fields);
  return first;
}
