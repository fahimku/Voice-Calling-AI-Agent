import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicEnv } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
