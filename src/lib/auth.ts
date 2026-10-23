import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    redirect("/login");
  }

  return {
    supabase,
    userId: data.claims.sub,
    email: data.claims.email ?? "Account",
  };
}

export async function getCurrentUserEmail(): Promise<string> {
  const { email } = await requireUser();
  return email;
}
