"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { placeTestCall, refreshTestCall } from "@/app/(app)/campaigns/test-call-actions";
import type { TestCallListItem } from "@/lib/calls";
import { formatDateTime } from "@/lib/format";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  in_progress: "In progress",
  ended: "Ended",
  failed: "Failed",
};

const outcomeLabels: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  no_answer: "No answer",
  voicemail: "Voicemail",
  callback: "Callback",
  do_not_call: "Do not call",
  failed: "Failed",
  completed: "Completed",
};

export function TestCallCard({
  campaignId,
  mockMode,
  needsPhoneNumber,
  calls,
}: {
  campaignId: string;
  mockMode: boolean;
  needsPhoneNumber: boolean;
  calls: TestCallListItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `test-call-${campaignId}`;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function openConfirm() {
    if (!formRef.current?.reportValidity()) return;
    setError(null);
    setPhoneError(null);
    setOpen(true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    const result = await placeTestCall(campaignId, new FormData(form));
    setPending(false);
    if (result.error) {
      setError(result.error);
      setPhoneError(result.fieldErrors?.phone ?? null);
      toast.error(result.error, { id: result.error });
      return;
    }
    toast.success("Test call placed.", { id: "test-call-placed" });
    setOpen(false);
    form.reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test call</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mockMode ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            MOCK MODE: no real calls are made
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          This calls the number you enter and ignores the campaign schedule.
        </p>
        {needsPhoneNumber ? (
          <p className="text-sm text-destructive">
            Add a Vapi phone number ID on this agent before placing a live test call.
          </p>
        ) : null}
        <form
          id={formId}
          ref={formRef}
          onSubmit={onSubmit}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Field label="Phone" htmlFor="test-call-phone" error={phoneError ?? undefined}>
            <Input
              id="test-call-phone"
              name="phone"
              placeholder="0501234567 or +1…"
              className="h-10"
              required
            />
          </Field>
          <Field label="Name" htmlFor="test-call-name">
            <Input id="test-call-name" name="name" placeholder="Optional" className="h-10" />
          </Field>
          <Button type="button" className="h-10" onClick={openConfirm} disabled={pending}>
            Place test call
          </Button>
        </form>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Place test call?</DialogTitle>
              <DialogDescription>
                {mockMode
                  ? "Mock mode is on. This number will not receive a real call."
                  : "This number will receive a real call."}
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" form={formId} disabled={pending}>
                {pending ? "Calling…" : "Place test call"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Recent test calls</h3>
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test calls yet. Place one to see it here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {calls.map((call) => (
                <li key={call.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{call.maskedPhone}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(call.startedAt)}</p>
                    </div>
                    <RefreshButton campaignId={campaignId} callId={call.id} />
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Status</dt>
                      <dd>{statusLabels[call.status] ?? call.status}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Outcome</dt>
                      <dd>{call.outcome ? (outcomeLabels[call.outcome] ?? call.outcome) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Duration</dt>
                      <dd>{call.durationSeconds == null ? "—" : `${call.durationSeconds}s`}</dd>
                    </div>
                    <div className="sm:col-span-4">
                      <dt className="text-xs text-muted-foreground">Summary</dt>
                      <dd className="line-clamp-3">{call.summary || "—"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RefreshButton({ campaignId, callId }: { campaignId: string; callId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const result = await refreshTestCall(campaignId, callId);
    setPending(false);
    if (result.error) {
      toast.error(result.error, { id: result.error });
      return;
    }
    toast.success("Status updated.", { id: `test-call-refresh-${callId}` });
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Refreshing…" : "Refresh status"}
    </Button>
  );
}
