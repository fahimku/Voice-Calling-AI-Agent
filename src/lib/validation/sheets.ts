import { z } from "zod";

export const sheetConnectionSchema = z.object({
  campaignId: z.uuid(),
  sheet: z.string().trim().min(1, "Enter a Google Sheet link or ID.").max(500),
  tab: z.string().trim().min(1, "Enter a tab name.").max(100),
});
