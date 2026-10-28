-- Call cost and dashboard aggregates.
-- Do not apply this from the app. Run `npx supabase db push`.

alter table public.calls
  add column cost_usd numeric(12, 4),
  add column cost_is_mock boolean not null default false;

alter table public.calls
  add constraint calls_cost_usd_check check (cost_usd is null or cost_usd >= 0);

comment on column public.calls.cost_usd is
  'Provider cost in USD. Mock calls store a small fake amount and set cost_is_mock.';

create index if not exists calls_started_at_idx on public.calls (started_at);

create or replace function public.dashboard_usage(p_now timestamptz)
returns table (
  calls_today bigint,
  daily_limit bigint,
  interested_this_week bigint,
  callbacks_due bigint,
  calls_this_month bigint,
  cost_this_month numeric,
  mock_cost_this_month numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      p_now as now_at,
      (date_trunc('week', p_now at time zone 'Asia/Dubai') at time zone 'Asia/Dubai') as week_start,
      (date_trunc('month', p_now at time zone 'Asia/Dubai') at time zone 'Asia/Dubai') as month_start
  ),
  active as (
    select id, daily_limit, timezone, count_retries_in_limit
    from campaigns
    where status = 'active'
  ),
  per_campaign as (
    select
      a.daily_limit,
      (
        select count(*)
        from calls
        where calls.campaign_id = a.id
          and calls.is_test = false
          and calls.started_at >= (date_trunc('day', (select now_at from bounds) at time zone a.timezone) at time zone a.timezone)
          and calls.started_at < ((date_trunc('day', (select now_at from bounds) at time zone a.timezone) + interval '1 day') at time zone a.timezone)
          and (a.count_retries_in_limit or calls.attempt_number = 1)
      ) as used
    from active a
  )
  select
    coalesce((select sum(used) from per_campaign), 0)::bigint,
    coalesce((select sum(daily_limit) from per_campaign), 0)::bigint,
    (select count(*) from leads, bounds where leads.status = 'interested' and leads.last_call_at >= bounds.week_start)::bigint,
    (select count(*) from leads, bounds where leads.status = 'callback' and leads.callback_at is not null and leads.callback_at <= bounds.now_at)::bigint,
    (select count(*) from calls, bounds where calls.started_at >= bounds.month_start and calls.started_at <= bounds.now_at)::bigint,
    (select coalesce(sum(calls.cost_usd), 0) from calls, bounds where calls.started_at >= bounds.month_start and calls.started_at <= bounds.now_at),
    (select coalesce(sum(calls.cost_usd), 0) from calls, bounds where calls.cost_is_mock and calls.started_at >= bounds.month_start and calls.started_at <= bounds.now_at);
$$;

create or replace function public.dashboard_outcomes(p_from timestamptz, p_to timestamptz)
returns table (day date, outcome text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (started_at at time zone 'Asia/Dubai')::date,
    coalesce(outcome, 'unknown'),
    count(*)::bigint
  from calls
  where started_at >= p_from
    and started_at < p_to
  group by 1, 2;
$$;

create or replace function public.dashboard_funnel(p_campaign_id uuid)
returns table (
  total_leads bigint,
  called bigint,
  answered bigint,
  interested bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where attempts > 0)::bigint,
    count(*) filter (where status in ('interested', 'not_interested', 'callback', 'do_not_call', 'completed'))::bigint,
    count(*) filter (where status = 'interested' or interest_level in ('high', 'medium', 'low'))::bigint
  from leads
  where campaign_id = p_campaign_id;
$$;

revoke all on function public.dashboard_usage(timestamptz) from public;
revoke all on function public.dashboard_outcomes(timestamptz, timestamptz) from public;
revoke all on function public.dashboard_funnel(uuid) from public;
grant execute on function public.dashboard_usage(timestamptz) to authenticated;
grant execute on function public.dashboard_outcomes(timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_funnel(uuid) to authenticated;
