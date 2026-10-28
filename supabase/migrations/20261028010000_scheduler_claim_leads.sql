-- Scheduler claim lock, per-call attempt number, and today's usage count.
-- Do not apply this from the app. Run `npx supabase db push`.

alter table public.calls
  add column attempt_number integer,
  add constraint calls_attempt_number_check check (attempt_number is null or attempt_number >= 1);

comment on column public.calls.attempt_number is
  'Lead attempts value after this call was claimed. 1 is the first attempt.';

create index calls_campaign_in_progress_idx
  on public.calls (campaign_id)
  where status = 'in_progress' and is_test = false;

-- Counts non-test calls started during the campaign's local day.
-- When count_retries_in_limit is false, only attempt_number = 1 counts.
-- Also counts leads already claimed (status calling) whose call row is not inserted yet,
-- so two overlapping ticks cannot both pass the daily limit.
create or replace function public.campaign_calls_used_today(p_campaign_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_timezone text;
  v_count_retries boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_used integer;
begin
  select owner_id, timezone, count_retries_in_limit
    into v_owner, v_timezone, v_count_retries
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    return 0;
  end if;

  if auth.uid() is not null and auth.uid() <> v_owner then
    return 0;
  end if;

  v_start := date_trunc('day', now() at time zone v_timezone) at time zone v_timezone;
  v_end := (date_trunc('day', now() at time zone v_timezone) + interval '1 day') at time zone v_timezone;

  select count(*)::integer into v_used
  from public.calls
  where campaign_id = p_campaign_id
    and is_test = false
    and started_at >= v_start
    and started_at < v_end
    and (v_count_retries or attempt_number = 1);

  v_used := v_used + (
    select count(*)::integer
    from public.leads
    where campaign_id = p_campaign_id
      and status = 'calling'
      and last_call_at >= v_start
      and last_call_at < v_end
      and (v_count_retries or attempts = 1)
      and not exists (
        select 1
        from public.calls
        where calls.lead_id = leads.id
          and calls.is_test = false
          and calls.started_at >= v_start
          and calls.started_at < v_end
      )
  );

  return v_used;
end;
$$;

revoke all on function public.campaign_calls_used_today(uuid) from public;
grant execute on function public.campaign_calls_used_today(uuid) to authenticated, service_role;

-- Claims eligible leads for one active campaign.
-- pg_advisory_xact_lock runs before the usage count and the row locks, so overlapping
-- ticks cannot double-claim or pass the daily limit.
create or replace function public.claim_leads_for_campaign(
  p_campaign_id uuid,
  p_batch_size integer
)
returns setof public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_max_attempts integer;
  v_daily_limit integer;
  v_max_concurrent integer;
  v_used integer;
  v_slots integer;
  v_batch integer;
begin
  if p_batch_size is null or p_batch_size <= 0 then
    return;
  end if;

  select owner_id, max_attempts, daily_limit, max_concurrent
    into v_owner, v_max_attempts, v_daily_limit, v_max_concurrent
  from public.campaigns
  where id = p_campaign_id
    and status = 'active';

  if v_owner is null then
    return;
  end if;

  if auth.uid() is not null and auth.uid() <> v_owner then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));

  v_used := public.campaign_calls_used_today(p_campaign_id);

  select count(*)::integer into v_slots
  from public.leads
  where campaign_id = p_campaign_id
    and status = 'calling';

  v_batch := least(
    p_batch_size,
    1000,
    greatest(0, v_daily_limit - v_used),
    greatest(0, v_max_concurrent - v_slots)
  );

  if v_batch <= 0 then
    return;
  end if;

  return query
  with picked as (
    select leads.id
    from public.leads
    where leads.campaign_id = p_campaign_id
      and (
        leads.status = 'pending'
        or (
          leads.status in ('no_answer', 'voicemail', 'failed')
          and leads.attempts < v_max_attempts
          and leads.next_attempt_at is not null
          and leads.next_attempt_at <= now()
        )
        or (
          leads.status = 'callback'
          and leads.callback_at is not null
          and leads.callback_at <= now()
        )
      )
      and not exists (
        select 1
        from public.dnc_numbers
        where dnc_numbers.owner_id = v_owner
          and dnc_numbers.phone_e164 = leads.phone_e164
      )
    order by
      case
        when leads.status = 'callback' then 0
        when leads.status in ('no_answer', 'voicemail', 'failed') then 1
        else 2
      end,
      leads.created_at
    limit v_batch
    for update skip locked
  )
  update public.leads
  set
    status = 'calling',
    attempts = leads.attempts + 1,
    last_call_at = now()
  from picked
  where leads.id = picked.id
  returning leads.*;
end;
$$;

revoke all on function public.claim_leads_for_campaign(uuid, integer) from public;
grant execute on function public.claim_leads_for_campaign(uuid, integer) to authenticated, service_role;
