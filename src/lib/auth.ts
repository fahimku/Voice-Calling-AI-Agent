import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getCurrentUserEmail(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return data.claims.email ?? "Account";
}
