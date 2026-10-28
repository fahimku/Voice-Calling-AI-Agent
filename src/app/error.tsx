"use client";

import { Button } from "@/components/ui/button";

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The page could not be loaded. Try again in a moment.</p>
      <Button type="button" onClick={reset} className="w-fit">
        Try again
      </Button>
    </main>
  );
}
