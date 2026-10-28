"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 py-10">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">This page could not be loaded. Nothing was changed. Try again.</p>
      <Button type="button" onClick={reset} className="w-fit">
        Try again
      </Button>
    </div>
  );
}
