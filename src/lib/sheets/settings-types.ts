export type SheetSettings = {
  migrationRequired: boolean;
  email: string;
  configured: boolean;
  sheetInput: string;
  tab: string;
  connected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};
