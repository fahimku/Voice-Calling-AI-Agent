-- Vapi phone number ID is optional until a number is connected.

alter table public.agents
  alter column provider_phone_number_id drop not null;
