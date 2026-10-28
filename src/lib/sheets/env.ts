export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function privateKeyFromEnv(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\\n/g, "\n").trim();
}

export function serviceAccountCredentials(email: string, privateKey: string) {
  return {
    email: email.trim(),
    key: privateKeyFromEnv(privateKey),
    scopes: [SHEETS_SCOPE],
  };
}

export type SheetRuntime = {
  email: string;
  privateKey: string;
  appUrl: string;
  secrets: string[];
  updatedAt: string;
  log?: (message: string) => void;
};

export function readSheetRuntime(now = new Date().toISOString()): SheetRuntime {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = privateKeyFromEnv(process.env.GOOGLE_PRIVATE_KEY);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const secrets = [privateKey].filter((value) => value.length >= 8);
  return { email, privateKey, appUrl, secrets, updatedAt: now };
}
