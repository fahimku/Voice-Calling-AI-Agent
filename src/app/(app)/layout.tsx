import { connection } from "next/server";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { getCurrentUserEmail } from "@/lib/auth";
import { voiceProviderMode } from "@/lib/providers/mode";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  await connection();
  const email = await getCurrentUserEmail();
  return (
    <AppShell email={email} mode={voiceProviderMode()}>
      {children}
    </AppShell>
  );
}
