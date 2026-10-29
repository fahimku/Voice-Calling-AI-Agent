export type PreflightStatus = "pass" | "warn" | "fail";

export const emptyDncWarning =
  "No numbers yet. Fine for a new account, but ask the client for any existing opt-out list and import it in Settings.";

export type PreflightCheck = {
  id: string;
  label: string;
  status: PreflightStatus;
  detail: string;
};

export type ActiveCampaignAgent = {
  name: string;
  assistantId: string;
  phoneNumberId: string;
};

export function publicAppUrlOk(url: string) {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) return false;
  return true;
}

export function evaluatePreflight(input: {
  vapiKeyPresent: boolean;
  webhookSecretPresent: boolean;
  cronSecretPresent: boolean;
  appUrl: string;
  activeCampaigns: ActiveCampaignAgent[];
  sheetConnected: boolean;
  googleReady: boolean;
  dncReadable: boolean;
  dncCount: number;
}): PreflightCheck[] {
  const missingAgents = input.activeCampaigns.filter(
    (campaign) => !campaign.assistantId.trim() || !campaign.phoneNumberId.trim(),
  );
  const agentDetail =
    input.activeCampaigns.length === 0
      ? "No campaigns are active."
      : missingAgents.length === 0
        ? "Every active campaign has an assistant ID and a phone number ID."
        : `${missingAgents.map((campaign) => campaign.name).join(", ")} ${missingAgents.length === 1 ? "is" : "are"} missing an assistant ID or phone number ID.`;

  const googleDetail = !input.sheetConnected
    ? "No Google Sheet is connected."
    : input.googleReady
      ? "Google credentials are present for the connected sheet."
      : "A sheet is connected, but the service account email or private key is missing.";

  const dncStatus: PreflightStatus = !input.dncReadable ? "fail" : input.dncCount > 0 ? "pass" : "warn";
  const dncDetail =
    dncStatus === "fail"
      ? "The do-not-call list could not be read."
      : dncStatus === "pass"
        ? `${input.dncCount} number${input.dncCount === 1 ? "" : "s"} on the do-not-call list.`
        : emptyDncWarning;

  return [
    {
      id: "vapi-key",
      label: "Vapi API key",
      status: input.vapiKeyPresent ? "pass" : "fail",
      detail: input.vapiKeyPresent ? "VAPI_API_KEY is set." : "VAPI_API_KEY is missing.",
    },
    {
      id: "agents",
      label: "Active campaign agents",
      status: missingAgents.length === 0 ? "pass" : "fail",
      detail: agentDetail,
    },
    {
      id: "webhook-secret",
      label: "Webhook secret",
      status: input.webhookSecretPresent ? "pass" : "fail",
      detail: input.webhookSecretPresent ? "VAPI_WEBHOOK_SECRET is set." : "VAPI_WEBHOOK_SECRET is missing.",
    },
    {
      id: "cron-secret",
      label: "Cron secret",
      status: input.cronSecretPresent ? "pass" : "fail",
      detail: input.cronSecretPresent ? "CRON_SECRET is set." : "CRON_SECRET is missing.",
    },
    {
      id: "app-url",
      label: "Public site URL",
      status: publicAppUrlOk(input.appUrl) ? "pass" : "fail",
      detail: publicAppUrlOk(input.appUrl)
        ? "NEXT_PUBLIC_APP_URL is https and is not localhost."
        : "NEXT_PUBLIC_APP_URL must be https and must not be localhost.",
    },
    {
      id: "google",
      label: "Google Sheets",
      status: !input.sheetConnected || input.googleReady ? "pass" : "fail",
      detail: googleDetail,
    },
    {
      id: "dnc",
      label: "Do-not-call list",
      status: dncStatus,
      detail: dncDetail,
    },
  ];
}

export function goLiveBlocked(checks: PreflightCheck[]) {
  return checks.some((check) => check.status === "fail");
}
