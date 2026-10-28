"use client";

import { useState } from "react";

export function CallRecording({ callId, available }: { callId: string; available: boolean }) {
  const [missing, setMissing] = useState(false);

  if (!available || missing) {
    return <p className="text-sm text-muted-foreground">No recording for this call.</p>;
  }

  return (
    <audio
      controls
      preload="none"
      className="w-full"
      src={`/api/calls/${callId}/recording`}
      onError={() => setMissing(true)}
    >
      No recording for this call.
    </audio>
  );
}
