type DbError = {
  code?: string;
  message?: string;
} | null;

export function friendlyDbError(error: DbError, fallback: string) {
  if (error?.code === "23502") {
    return "A required field is missing. If you left the phone number ID blank, run supabase db push to apply the latest migration.";
  }
  if (error?.code === "23503") {
    return "This agent is used by a campaign. Remove it from those campaigns before deleting it.";
  }
  if (error?.code === "23514") {
    return "Some values are outside the allowed range.";
  }
  return fallback;
}
