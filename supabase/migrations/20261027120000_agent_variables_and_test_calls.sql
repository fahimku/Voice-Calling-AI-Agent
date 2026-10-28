-- Prompt variables for the voice agent, and test calls that are not tied to a lead.

alter table public.agents
  add column agent_display_name text,
  add column business_name text,
  add column variables jsonb not null default '{}'::jsonb,
  add constraint agents_variables_object check (jsonb_typeof(variables) = 'object'),
  add constraint agents_display_name_length check (
    agent_display_name is null or char_length(agent_display_name) <= 80
  ),
  add constraint agents_business_name_length check (
    business_name is null or char_length(business_name) <= 120
  );

comment on column public.agents.agent_display_name is
  'Name the assistant says on the call, injected as agent_name.';

comment on column public.agents.business_name is
  'Business name injected as business_name.';

comment on column public.agents.variables is
  'Extra prompt variables injected into the Vapi assistant.';

alter table public.calls
  add column is_test boolean not null default false;

alter table public.calls
  alter column lead_id drop not null;

alter table public.calls
  add constraint calls_lead_required_unless_test check (is_test or lead_id is not null);

comment on column public.calls.is_test is
  'True when the call was placed from the test-call button.';

comment on column public.calls.lead_id is
  'Null for test calls that are not tied to a lead.';

-- Test calls have no lead, so the lead-existence check must allow null.
drop policy calls_insert_own on public.calls;
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
    and (
      calls.lead_id is null
      or exists (
        select 1
        from public.leads
        where leads.id = calls.lead_id
          and leads.campaign_id = calls.campaign_id
      )
    )
  );

drop policy calls_update_own on public.calls;
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
    and (
      calls.lead_id is null
      or exists (
        select 1
        from public.leads
        where leads.id = calls.lead_id
          and leads.campaign_id = calls.campaign_id
      )
    )
  );

create index calls_campaign_test_created_idx
  on public.calls (campaign_id, created_at desc)
  where is_test;
