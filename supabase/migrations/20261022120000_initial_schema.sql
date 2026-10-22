-- Initial schema for the calling portal.
-- Do not apply this from the app. Use `supabase db push` after linking the project.

create extension if not exists pgcrypto;

create type public.business_type as enum ('tuition', 'real_estate', 'other');

create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed');

create type public.lead_status as enum (
  'pending',
  'calling',
  'no_answer',
  'voicemail',
  'interested',
  'not_interested',
  'callback',
  'do_not_call',
  'failed',
  'completed'
);

create type public.interest_level as enum ('high', 'medium', 'low', 'none');

create type public.call_status as enum ('queued', 'in_progress', 'ended', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  business_type public.business_type not null,
  provider text not null default 'vapi',
  provider_assistant_id text not null,
  provider_phone_number_id text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_provider_check check (provider = 'vapi'),
  constraint agents_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete restrict,
  name text not null,
  status public.campaign_status not null default 'draft',
  timezone text not null default 'Asia/Dubai',
  daily_limit integer not null,
  window_start time not null,
  window_end time not null,
  -- 1 = Monday through 7 = Sunday, matching Luxon weekday.
  active_days integer[] not null,
  max_concurrent integer not null default 2,
  max_attempts integer not null default 3,
  retry_delay_minutes integer not null default 120,
  count_retries_in_limit boolean not null default true,
  sheet_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_name_not_blank check (char_length(btrim(name)) > 0),
  constraint campaigns_daily_limit_check check (daily_limit > 0),
  constraint campaigns_window_check check (window_start < window_end),
  constraint campaigns_active_days_check check (
    cardinality(active_days) > 0
    and active_days <@ array[1, 2, 3, 4, 5, 6, 7]
  ),
  constraint campaigns_max_concurrent_check check (max_concurrent > 0),
  constraint campaigns_max_attempts_check check (max_attempts > 0),
  constraint campaigns_retry_delay_check check (retry_delay_minutes >= 0),
  constraint campaigns_timezone_not_blank check (char_length(btrim(timezone)) > 0)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text,
  phone_e164 text not null,
  extra jsonb not null default '{}'::jsonb,
  status public.lead_status not null default 'pending',
  interest_level public.interest_level,
  callback_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_call_at timestamptz,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_phone_e164_unique unique (campaign_id, phone_e164),
  constraint leads_phone_e164_format check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  constraint leads_attempts_check check (attempts >= 0)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  provider_call_id text,
  status public.call_status not null default 'queued',
  ended_reason text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  outcome text,
  summary text,
  transcript text,
  -- Provider reference only. Not a public recording URL.
  recording_ref text,
  structured_data jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calls_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint calls_outcome_check check (
    outcome is null
    or outcome in (
      'no_answer',
      'voicemail',
      'interested',
      'not_interested',
      'callback',
      'do_not_call',
      'failed',
      'completed'
    )
  )
);

comment on column public.calls.recording_ref is
  'Provider reference only. Not a public recording URL.';

create table public.dnc_numbers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dnc_numbers_owner_phone_unique unique (owner_id, phone_e164),
  constraint dnc_numbers_phone_e164_format check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

create index agents_owner_id_idx on public.agents (owner_id);
create index campaigns_owner_id_idx on public.campaigns (owner_id);
create index campaigns_active_idx on public.campaigns (id) where status = 'active';
create index leads_campaign_status_idx on public.leads (campaign_id, status);
create index leads_next_attempt_at_idx on public.leads (next_attempt_at) where next_attempt_at is not null;
create index calls_created_at_idx on public.calls (created_at);
create index calls_campaign_started_at_idx on public.calls (campaign_id, started_at);
create unique index calls_provider_call_id_idx on public.calls (provider_call_id) where provider_call_id is not null;

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

create trigger dnc_numbers_set_updated_at
  before update on public.dnc_numbers
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.calls enable row level security;
alter table public.dnc_numbers enable row level security;

create policy agents_select_own
  on public.agents
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy agents_insert_own
  on public.agents
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy agents_update_own
  on public.agents
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy agents_delete_own
  on public.agents
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy campaigns_select_own
  on public.campaigns
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy campaigns_insert_own
  on public.campaigns
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.agents
      where agents.id = campaigns.agent_id
        and agents.owner_id = auth.uid()
    )
  );

create policy campaigns_update_own
  on public.campaigns
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.agents
      where agents.id = campaigns.agent_id
        and agents.owner_id = auth.uid()
    )
  );

create policy campaigns_delete_own
  on public.campaigns
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy leads_select_own
  on public.leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = leads.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy leads_insert_own
  on public.leads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = leads.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy leads_update_own
  on public.leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = leads.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = leads.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy leads_delete_own
  on public.leads
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = leads.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy calls_select_own
  on public.calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = calls.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy calls_insert_own
  on public.calls
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = calls.campaign_id
        and campaigns.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.leads
      where leads.id = calls.lead_id
        and leads.campaign_id = calls.campaign_id
    )
  );

create policy calls_update_own
  on public.calls
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = calls.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = calls.campaign_id
        and campaigns.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.leads
      where leads.id = calls.lead_id
        and leads.campaign_id = calls.campaign_id
    )
  );

create policy calls_delete_own
  on public.calls
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.campaigns
      where campaigns.id = calls.campaign_id
        and campaigns.owner_id = auth.uid()
    )
  );

create policy dnc_numbers_select_own
  on public.dnc_numbers
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy dnc_numbers_insert_own
  on public.dnc_numbers
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy dnc_numbers_update_own
  on public.dnc_numbers
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy dnc_numbers_delete_own
  on public.dnc_numbers
  for delete
  to authenticated
  using (owner_id = auth.uid());

revoke all on table public.agents from public, anon;
revoke all on table public.campaigns from public, anon;
revoke all on table public.leads from public, anon;
revoke all on table public.calls from public, anon;
revoke all on table public.dnc_numbers from public, anon;

grant select, insert, update, delete on table public.agents to authenticated, service_role;
grant select, insert, update, delete on table public.campaigns to authenticated, service_role;
grant select, insert, update, delete on table public.leads to authenticated, service_role;
grant select, insert, update, delete on table public.calls to authenticated, service_role;
grant select, insert, update, delete on table public.dnc_numbers to authenticated, service_role;
