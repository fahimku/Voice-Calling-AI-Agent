type DbError = {
  code?: string;
  message?: string;
} | null;

export const migrationRequiredMessage =
  "The latest database migration is not applied yet. Run supabase db push, then try again.";

export function isMissingColumn(error: DbError) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export function isMissingFunction(error: DbError) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

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
