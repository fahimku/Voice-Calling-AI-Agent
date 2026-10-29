import { z } from "zod";

import { MAX_IMPORT_ROWS } from "@/lib/leads/preview";

export const dncPhoneListSchema = z
  .array(z.string().max(40))
  .max(MAX_IMPORT_ROWS, "This file has more than 5,000 rows.");
