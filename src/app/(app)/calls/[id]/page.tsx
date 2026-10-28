import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CallRecording } from "@/components/calls/call-recording";
import { TranscriptView } from "@/components/calls/transcript-view";
import { Badge } from "@/components/ui/badge";
import { DeferredPage } from "@/components/deferred-page";
import { getCallDetail } from "@/lib/calls/log";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DeferredPage>
      <CallDetailContent params={params} />
    </DeferredPage>
  );
}

function field(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

async function CallDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const call = await getCallDetail(id);
  if (!call) notFound();

  const structured = call.structured ?? {};
  const leadHref = call.leadSearch
    ? `/campaigns/${call.campaignId}/leads?q=${encodeURIComponent(call.leadSearch)}`
    : `/campaigns/${call.campaignId}/leads`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/calls" className="text-sm text-muted-foreground hover:underline">
          Back to calls
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{call.leadName ?? call.maskedPhone}</h1>
          {call.doNotCall ? <Badge variant="destructive">Do not call</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {call.campaignName} · {formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)}
        </p>
      </div>
      <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Ended reason</dt>
          <dd className="text-sm font-medium">{call.endedReason ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Outcome</dt>
          <dd className="text-sm font-medium capitalize">{call.outcome?.replaceAll("_", " ") ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Interested</dt>
          <dd className="text-sm font-medium">{field(structured.interested)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Interest level</dt>
          <dd className="text-sm font-medium capitalize">{field(structured.interest_level)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Callback time</dt>
          <dd className="text-sm font-medium">
            {typeof structured.callback_time === "string" ? formatDateTime(structured.callback_time) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Notes</dt>
          <dd className="text-sm font-medium">{field(structured.notes)}</dd>
        </div>
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Summary</h2>
        <p className="text-sm">{call.summary ?? "No summary yet."}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Recording</h2>
        <CallRecording callId={call.id} available={call.recordingAvailable} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Transcript</h2>
        <TranscriptView transcript={call.transcript} />
      </section>
      {call.leadId ? (
        <Link href={leadHref} className="text-sm hover:underline">
          View lead
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">This was a test call, so it is not attached to a lead.</p>
      )}
    </div>
  );
}
