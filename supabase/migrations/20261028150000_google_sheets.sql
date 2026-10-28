-- Google Sheets connection, import row numbers, and write-back flags.
-- Do not apply this from the app. Run `npx supabase db push`.

alter table public.campaigns
  add column sheet_tab text default 'Leads',
  add column sheet_last_synced_at timestamptz,
  add column sheet_last_error text,
  add constraint campaigns_sheet_tab_check check (sheet_tab is null or char_length(btrim(sheet_tab)) between 1 and 100);

alter table public.leads
  add column sheet_row integer,
  add column sheet_dirty boolean not null default false,
  add constraint leads_sheet_row_check check (sheet_row is null or sheet_row >= 2);

comment on column public.campaigns.sheet_tab is
  'Tab name inside the connected Google Sheet. Defaults to Leads.';
comment on column public.campaigns.sheet_last_error is
  'Short secret-free message from the last Sheets sync failure.';
comment on column public.leads.sheet_row is
  '1-based sheet row for this lead. Row 1 is the header.';
comment on column public.leads.sheet_dirty is
  'True when call results still need to be written to the connected sheet.';

create index leads_campaign_sheet_dirty_idx
  on public.leads (campaign_id)
  where sheet_dirty;

-- Same claim as the scheduler migration, plus sheet_dirty so write-back does not call Google here.
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
    last_call_at = now(),
    sheet_dirty = true
  from picked
  where leads.id = picked.id
  returning leads.*;
end;
$$;

revoke all on function public.claim_leads_for_campaign(uuid, integer) from public;
grant execute on function public.claim_leads_for_campaign(uuid, integer) to authenticated, service_role;
