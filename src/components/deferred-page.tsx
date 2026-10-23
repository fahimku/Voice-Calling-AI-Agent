import { Suspense } from "react";

export function DeferredPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      {children}
    </Suspense>
  );
}
