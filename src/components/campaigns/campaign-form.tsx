"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { TimezoneSelect } from "@/components/campaigns/timezone-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { weekdays } from "@/lib/format";
import type { ActionState } from "@/lib/validation/errors";

const disclosure =
  "Your agent must disclose it is an AI and that the call may be recorded at the start of the call, and must honour opt-out requests.";

export type CampaignFormValues = {
  name: string;
  agentId: string;
  timezone: string;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
  activeDays: number[];
  maxConcurrent: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  countRetriesInLimit: boolean;
};

const defaults: CampaignFormValues = {
  name: "",
  agentId: "",
  timezone: "Asia/Dubai",
  dailyLimit: 50,
  windowStart: "09:00",
  windowEnd: "18:00",
  activeDays: [1, 2, 3, 4, 5],
  maxConcurrent: 2,
  maxAttempts: 3,
  retryDelayMinutes: 120,
  countRetriesInLimit: true,
};

export function CampaignForm({
  action,
  submitLabel,
  agents,
  values,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  agents: { id: string; name: string }[];
  values?: CampaignFormValues;
}) {
  const initial = values ?? defaults;
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState(initial.name);
  const [agentId, setAgentId] = useState(initial.agentId);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [windowStart, setWindowStart] = useState(initial.windowStart);
  const [windowEnd, setWindowEnd] = useState(initial.windowEnd);
  const [activeDays, setActiveDays] = useState<number[]>(initial.activeDays);
  const [maxConcurrent, setMaxConcurrent] = useState(String(initial.maxConcurrent));
  const [maxAttempts, setMaxAttempts] = useState(String(initial.maxAttempts));
  const [retryDelay, setRetryDelay] = useState(String(initial.retryDelayMinutes));
  const [countRetries, setCountRetries] = useState(initial.countRetriesInLimit);

  useEffect(() => {
    if (state.error) toast.error(state.error, { id: state.error });
  }, [state]);

  function toggleDay(day: number, checked: boolean) {
    setActiveDays((current) => {
      if (checked) return [...current, day].sort((left, right) => left - right);
      return current.filter((value) => value !== day);
    });
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {disclosure}
      </p>
      {agents.length === 0 ? (
        <p className="text-sm">
          Create an agent before you can save a campaign.{" "}
          <Link href="/agents/new" className="font-medium underline-offset-4 hover:underline">
            Create agent
          </Link>
        </p>
      ) : null}
      <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10"
          required
        />
      </Field>
      <Field label="Agent" htmlFor="agentId" error={state.fieldErrors?.agentId}>
        <input type="hidden" name="agentId" value={agentId} />
        <Select value={agentId || null} onValueChange={(value) => setAgentId(value ?? "")}>
          <SelectTrigger id="agentId" className="h-10 w-full">
            <SelectValue placeholder="Choose an agent">
              {(value) =>
                agents.find((agent) => agent.id === value)?.name ?? "Choose an agent"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Timezone" htmlFor="timezone" error={state.fieldErrors?.timezone}>
        <input type="hidden" name="timezone" value={timezone} />
        <TimezoneSelect id="timezone" value={timezone} onChange={setTimezone} />
      </Field>
      <Field label="Daily limit" htmlFor="dailyLimit" error={state.fieldErrors?.dailyLimit}>
        <Input
          id="dailyLimit"
          name="dailyLimit"
          type="number"
          min={1}
          max={1000}
          value={dailyLimit}
          onChange={(event) => setDailyLimit(event.target.value)}
          className="h-10"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Window start" htmlFor="windowStart" error={state.fieldErrors?.windowStart}>
          <Input
            id="windowStart"
            name="windowStart"
            type="time"
            value={windowStart}
            onChange={(event) => setWindowStart(event.target.value)}
            className="h-10"
            required
          />
        </Field>
        <Field label="Window end" htmlFor="windowEnd" error={state.fieldErrors?.windowEnd}>
          <Input
            id="windowEnd"
            name="windowEnd"
            type="time"
            value={windowEnd}
            onChange={(event) => setWindowEnd(event.target.value)}
            className="h-10"
            required
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Active days</legend>
        <div className="flex flex-wrap gap-3">
          {weekdays.map((day) => {
            const checked = activeDays.includes(day.value);
            return (
              <label key={day.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => toggleDay(day.value, next)}
                />
                {day.label}
              </label>
            );
          })}
        </div>
        {activeDays.map((day) => (
          <input key={day} type="hidden" name="activeDays" value={day} />
        ))}
        {state.fieldErrors?.activeDays ? (
          <p className="text-sm text-destructive">{state.fieldErrors.activeDays}</p>
        ) : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max concurrent" htmlFor="maxConcurrent" error={state.fieldErrors?.maxConcurrent}>
          <Input
            id="maxConcurrent"
            name="maxConcurrent"
            type="number"
            min={1}
            max={10}
            value={maxConcurrent}
            onChange={(event) => setMaxConcurrent(event.target.value)}
            className="h-10"
            required
          />
        </Field>
        <Field label="Max attempts" htmlFor="maxAttempts" error={state.fieldErrors?.maxAttempts}>
          <Input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={5}
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(event.target.value)}
            className="h-10"
            required
          />
        </Field>
        <Field
          label="Retry delay (minutes)"
          htmlFor="retryDelayMinutes"
          error={state.fieldErrors?.retryDelayMinutes}
        >
          <Input
            id="retryDelayMinutes"
            name="retryDelayMinutes"
            type="number"
            min={15}
            max={1440}
            value={retryDelay}
            onChange={(event) => setRetryDelay(event.target.value)}
            className="h-10"
            required
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
        <div>
          <p className="text-sm font-medium">Count retries in the daily limit</p>
          <p className="text-sm text-muted-foreground">
            When off, only the first attempt counts toward the limit.
          </p>
        </div>
        <input type="hidden" name="countRetriesInLimit" value={String(countRetries)} />
        <Switch checked={countRetries} onCheckedChange={setCountRetries} />
      </div>
      <Button type="submit" disabled={pending || agents.length === 0} className="w-fit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
