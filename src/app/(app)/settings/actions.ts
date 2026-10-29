"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { previewDncImport, type DncPreviewRow } from "@/lib/dnc/preview";
import { friendlyDbError } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone/normalize";
import { dncPhoneListSchema } from "@/lib/validation/dnc";

const PREVIEW_ROW_LIMIT = 20;
const insertChunkSize = 500;

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/settings/go-live");
}

async function existingNumbers(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  phones: string[],
) {
  const existing = new Set<string>();
  for (let index = 0; index < phones.length; index += 200) {
    const chunk = phones.slice(index, index + 200);
    const result = await supabase.from("dnc_numbers").select("phone_e164").eq("owner_id", userId).in("phone_e164", chunk);
    if (result.error) return { error: "Could not check the do-not-call list." as const };
    for (const row of result.data ?? []) existing.add(String(row.phone_e164));
  }
  return { existing };
}

export async function previewDncCsv(phones: string[]) {
  const parsed = dncPhoneListSchema.safeParse(phones);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check this file and try again." };
  if (parsed.data.length === 0) return { error: "This file has no phone numbers." };

  const { supabase, userId } = await requireUser();
  const cells = parsed.data.map((raw, index) => ({ rowNumber: index + 1, raw }));
  const candidates = [
    ...new Set(
      cells.flatMap((cell) => {
        const phone = normalizePhone(cell.raw);
        return phone.ok ? [phone.e164] : [];
      }),
    ),
  ];
  const matches = await existingNumbers(supabase, userId, candidates);
  if ("error" in matches) return matches;

  const preview = previewDncImport(cells, matches.existing);
  return {
    ok: true as const,
    counts: preview.counts,
    rows: preview.rows.slice(0, PREVIEW_ROW_LIMIT) satisfies DncPreviewRow[],
    insertable: preview.insertable,
  };
}

export async function importDncNumbers(phones: string[]) {
  const parsed = dncPhoneListSchema.safeParse(phones);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check this file and try again." };

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.data) {
    const phone = normalizePhone(raw);
    if (!phone.ok || seen.has(phone.e164)) continue;
    seen.add(phone.e164);
    unique.push(phone.e164);
  }
  if (unique.length === 0) return { error: "None of these numbers can be imported.", inserted: 0 };

  const { supabase, userId } = await requireUser();
  let inserted = 0;
  for (let index = 0; index < unique.length; index += insertChunkSize) {
    const chunk = unique.slice(index, index + insertChunkSize).map((phone) => ({
      owner_id: userId,
      phone_e164: phone,
    }));
    const saved = await supabase
      .from("dnc_numbers")
      .upsert(chunk, { onConflict: "owner_id,phone_e164", ignoreDuplicates: true })
      .select("id");
    if (saved.error) return { error: friendlyDbError(saved.error, "Could not import these numbers.") };
    inserted += saved.data?.length ?? 0;
  }

  revalidateSettings();
  return { ok: true as const, inserted };
}
