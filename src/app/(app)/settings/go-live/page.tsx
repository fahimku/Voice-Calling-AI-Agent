import Link from "next/link";

import { DeferredPage } from "@/components/deferred-page";
import { Badge } from "@/components/ui/badge";
import { evaluatePreflight } from "@/lib/dashboard/preflight";
import { googleCredentialsReady, secretPresent } from "@/lib/dashboard/load";
import { requireUser } from "@/lib/auth";

export default function GoLivePage() {
  return (
    <DeferredPage>
      <GoLiveContent />
    </DeferredPage>
  );
}

async function GoLiveContent() {
  const { supabase, userId } = await requireUser();
  const [campaigns, sheets, dnc] = await Promise.all([
    supabase
      .from("campaigns")
      .select("name, status, agents(provider_assistant_id, provider_phone_number_id)")
      .eq("owner_id", userId)
      .eq("status", "active"),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("owner_id", userId).not("sheet_id", "is", null),
    supabase.from("dnc_numbers").select("id", { count: "exact", head: true }).eq("owner_id", userId),
  ]);

  const activeCampaigns = (campaigns.data ?? []).map((campaign) => {
    const agent = Array.isArray(campaign.agents) ? campaign.agents[0] : campaign.agents;
    return {
      name: typeof campaign.name === "string" ? campaign.name : "Campaign",
      assistantId: agent && typeof agent.provider_assistant_id === "string" ? agent.provider_assistant_id : "",
      phoneNumberId: agent && typeof agent.provider_phone_number_id === "string" ? agent.provider_phone_number_id : "",
    };
  });

  const checks = evaluatePreflight({
    vapiKeyPresent: secretPresent("VAPI_API_KEY"),
    webhookSecretPresent: secretPresent("VAPI_WEBHOOK_SECRET"),
    cronSecretPresent: secretPresent("CRON_SECRET"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    activeCampaigns,
    sheetConnected: (sheets.count ?? 0) > 0 && !sheets.error,
    googleReady: googleCredentialsReady(),
    dncReadable: !dnc.error,
    dncCount: dnc.count ?? 0,
  });
  const ready = checks.every((check) => check.status === "pass");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
          Back to settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Go live</h1>
        <p className="text-sm text-muted-foreground">
          {ready ? "Every check passed. You can switch VOICE_PROVIDER_MODE to live." : "Fix the failed checks before placing real calls."}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {checks.map((check) => (
          <li key={check.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{check.label}</h2>
              <Badge variant={check.status === "pass" ? "default" : "destructive"}>
                {check.status === "pass" ? "PASS" : "FAIL"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
