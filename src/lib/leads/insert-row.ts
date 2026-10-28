export function leadInsertRow(
  campaignId: string,
  row: { name: string | null; phone: string; extra: Record<string, string>; sheetRow?: number },
) {
  return {
    campaign_id: campaignId,
    name: row.name,
    phone_e164: row.phone,
    extra: row.extra,
    status: "pending" as const,
    ...(row.sheetRow ? { sheet_row: row.sheetRow } : {}),
  };
}
