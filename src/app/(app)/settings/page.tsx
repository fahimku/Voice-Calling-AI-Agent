import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeferredPage } from "@/components/deferred-page";

export default function SettingsPage() {
  return (
    <DeferredPage>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Connection checks and the do-not-call list.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Go live</CardTitle>
            <CardDescription>Check secrets, agents, the public URL, Sheets, and the do-not-call list before real calls.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/go-live" className="text-sm hover:underline">
              Open the go-live checklist
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Do not call</CardTitle>
            <CardDescription>
              Numbers are added here when a person asks not to be called. The scheduler skips them for every campaign.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The go-live checklist reports whether this list has numbers. It never shows the numbers themselves on that page.
            </p>
          </CardContent>
        </Card>
      </div>
    </DeferredPage>
  );
}
