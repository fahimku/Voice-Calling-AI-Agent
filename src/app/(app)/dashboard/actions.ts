"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-error";

export async function pauseAllCampaigns() {
  const { supabase, userId } = await requireUser();
  const updated = await supabase
    .from("campaigns")
    .update({ status: "paused" }, { count: "exact" })
    .eq("owner_id", userId)
    .eq("status", "active");
  if (updated.error) {
    return { error: friendlyDbError(updated.error, "Could not pause campaigns."), paused: 0 };
  }

  revalidatePath("/dashboard");
  revalidatePath("/campaigns", "layout");
  return { error: null, paused: updated.count ?? 0 };
}
