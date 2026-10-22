import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { getCurrentUserEmail } from "@/lib/auth";

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
  const email = await getCurrentUserEmail();
  return <AppShell email={email}>{children}</AppShell>;
}
