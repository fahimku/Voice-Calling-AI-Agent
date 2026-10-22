# ROLE
You are a senior full-stack engineer. Build an MVP "AI Outbound Calling Campaign Portal" step by step. Work in PHASES (listed at the end). After each phase: explain what you built, how to run/test it, then STOP and wait for me to say "next". Do not skip ahead. Before writing code for each phase, give me a short plan.

# PRODUCT
A portal where a business owner:
1. Uploads a list of phone numbers (CSV/XLSX or Google Sheet).
2. Creates a Campaign = one AI voice agent + one lead list + a schedule + a DAILY CALL LIMIT.
3. The system automatically places outbound calls via a voice AI provider (Vapi first) during the allowed hours only, never exceeding the daily limit.
4. After each call, results (status, interest level, summary, callback time, recording, transcript) are saved and written back to the lead list / Google Sheet.
Language: English-only calls. Target market: UAE (timezone Asia/Dubai, default phone region AE). Businesses: tuition centres, real estate marketing, etc. Each business has its own agent/script.

# TECH STACK (fixed, do not change without asking)
- Next.js (latest, App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- Supabase (Postgres + Auth + RLS). SQL migrations in /supabase/migrations
- Zod for all input validation
- libphonenumber-js (E.164 normalization, default region AE)
- luxon for timezone logic
- papaparse (CSV) + xlsx (Excel) for imports
- googleapis for Google Sheets (service account) write-back
- Vitest for unit tests (scheduler logic MUST be tested)
- Voice provider: Vapi (REST). Implement behind a `VoiceProvider` interface (`startCall`, `parseWebhook`) so Retell can be added later. Check the current Vapi docs before coding the API calls; do not guess field names.
- No secrets in code. Use .env.local and provide .env.example.

# DATA MODEL (Postgres)
- agents: id, owner_id, name, business_type (tuition|real_estate|other), provider ('vapi'), provider_assistant_id, provider_phone_number_id, notes, created_at
- campaigns: id, owner_id, agent_id, name, status (draft|active|paused|completed), timezone (default 'Asia/Dubai'), daily_limit int, window_start time, window_end time, active_days int[] (1-7), max_concurrent int default 2, max_attempts int default 3, retry_delay_minutes int default 120, count_retries_in_limit bool default true, sheet_id text null, created_at
- leads: id, campaign_id, name, phone_e164, extra jsonb (any other CSV columns), status (pending|calling|no_answer|voicemail|interested|not_interested|callback|do_not_call|failed|completed), interest_level (high|medium|low|none) null, callback_at timestamptz null, attempts int default 0, next_attempt_at timestamptz null, last_call_at, summary text, created_at. UNIQUE(campaign_id, phone_e164)
- calls: id, campaign_id, lead_id, provider_call_id, status (queued|in_progress|ended|failed), ended_reason, started_at, ended_at, duration_seconds, outcome, summary, transcript text, recording_ref text (provider reference only, NOT a public URL), structured_data jsonb, raw_payload jsonb, created_at
- dnc_numbers: id, owner_id, phone_e164 unique per owner (global do-not-call list; leads matching it are skipped)
Enable RLS so each user only sees their own data. Add useful indexes (campaign_id+status, next_attempt_at, calls.created_at).

# SCHEDULER (the core logic, build as a pure, unit-tested function + an API route)
Endpoint: POST /api/scheduler/tick, protected by header `x-cron-secret` (env CRON_SECRET). An external cron (n8n or cron-job.org) will call it every 5 minutes.
For each ACTIVE campaign on each tick:
1. Convert now to the campaign timezone (luxon). Skip if today is not in active_days or current time is outside [window_start, window_end).
2. Count calls started today in the campaign timezone. If `count_retries_in_limit` is false, count only first attempts. remaining = daily_limit - used. If remaining <= 0, skip (the limit resets at local midnight).
3. Count calls currently in_progress. available_slots = max_concurrent - in_progress.
4. batch_size = min(remaining, available_slots).
5. Atomically claim up to batch_size leads (a Postgres function using `FOR UPDATE SKIP LOCKED`) where status = 'pending' OR (status IN ('no_answer','voicemail','failed') AND attempts < max_attempts AND next_attempt_at <= now) OR (status = 'callback' AND callback_at <= now). Exclude numbers in dnc_numbers. Set status='calling', attempts+1.
6. For each claimed lead, call VoiceProvider.startCall(). Insert a `calls` row. If the provider call fails to start, mark the call failed, set the lead to 'failed' with next_attempt_at = now + retry_delay, and continue.
7. Must be idempotent and safe if two ticks overlap (no double calls, no exceeding the limit).
Write Vitest tests for: outside window, non-active day, limit reached, limit reset next day, concurrency cap, retry rules, DNC skip, timezone edge cases.

# WEBHOOK
POST /api/webhooks/vapi: verify the shared secret from Vapi per the docs (env VAPI_WEBHOOK_SECRET). Handle the end-of-call report: find the call by provider_call_id, save ended_reason, duration, summary, transcript, recording reference, structured analysis data. Map to an outcome and update the lead:
- customer did not answer / busy -> no_answer (schedule retry if attempts < max_attempts)
- voicemail -> voicemail
- structured data interested=true -> interested (+ interest_level)
- wants callback (+ callback time) -> callback with callback_at
- asked not to be called -> do_not_call AND insert into dnc_numbers
- not interested -> not_interested
Then write the result back to Google Sheets if the campaign has a sheet_id. Webhook must always respond 200 quickly and be idempotent (the same payload twice must not double-update).
In the README, document the Vapi assistant structured output / analysis schema I need to configure: { interested: boolean, interest_level: "high|medium|low|none", callback_requested: boolean, callback_time: string|null, do_not_call: boolean, notes: string }.

# RECORDINGS (important)
Vapi recording storage is now access-controlled; recordings must be fetched through Vapi's authenticated endpoints, not public links. Check the current Vapi docs/migration guide. Never store or expose public recording URLs. Build a server-side route (e.g. GET /api/calls/[id]/recording) that checks the logged-in user owns the call, fetches the recording from Vapi with VAPI_API_KEY, and streams it to the browser.

# UI PAGES (clean, simple, mobile-friendly)
- /login, /signup (Supabase email auth)
- /dashboard: today's calls used / daily limit per campaign, outcome counts (interested, callback, no answer, etc.), last 10 calls
- /agents: list/create agents (name, business type, Vapi assistant ID, Vapi phone number ID)
- /campaigns: list + create. Campaign form: name, agent, timezone, daily limit, call window, active days, max concurrent, max attempts, retry delay
- /campaigns/[id]: settings, Start / Pause buttons, live stats, "Run test call to my number" button (calls ONE number I type, ignoring the schedule)
- /campaigns/[id]/leads: table with search, status filter, pagination, CSV/XLSX upload (preview first: show valid / invalid / duplicate counts, map columns Name + Phone), export CSV, add single number
- /calls: call log table, click a row for the summary, transcript, and an audio player for the recording (via the server-side recording route)
- /settings: DNC list management, Google Sheets connection instructions

# COMPLIANCE & SAFETY (must implement)
- Never call numbers in dnc_numbers. Never call outside the campaign window.
- Validate/normalize all numbers to E.164; reject invalid.
- Add a visible note in the campaign form: "Your agent must disclose it is an AI and that the call may be recorded at the start of the call, and must honour opt-out requests." Include a sample opening line in the README.
- Never log full secrets or API keys. Rate-limit the webhook and scheduler routes.

# CODE QUALITY
- Folder structure: /src/app, /src/lib (providers, scheduler, sheets, phone), /src/components, /supabase/migrations, /tests
- Server-only code stays server-side. Use server actions or route handlers with Zod validation.
- Friendly error messages, loading states, empty states.
- README with: setup, env vars, how to run migrations, how to test the webhook locally (ngrok or cloudflared), how to configure the Vapi assistant, how to set up the cron.

# ENV VARIABLES
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key), SUPABASE_SERVICE_ROLE_KEY, VAPI_API_KEY, VAPI_WEBHOOK_SECRET, CRON_SECRET

# PHASES (stop after each one)
1. Project setup, Supabase schema + RLS migrations, auth, layout, .env.example
2. Agents + Campaigns CRUD
3. Leads import (CSV/XLSX preview + validate + dedupe), leads table, export
4. VoiceProvider interface + Vapi implementation + "test call" button
5. Scheduler tick + daily limit/window/retry logic + Vitest tests
6. Vapi webhook + outcome mapping + calls log page + secure recording route
7. Google Sheets write-back
8. Dashboard stats, polish, README, deployment notes