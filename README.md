# Calling Agent

Portal for outbound AI calling campaigns. This README covers local setup through Phase 6: the app shell, email auth, agents, campaigns, leads, test calls, the scheduler, and call results.

## Requirements

- Node.js 20 or newer
- A Supabase project
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), when you are ready to push the migration

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the env template and fill in your Supabase project URL and publishable key:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is the publishable key from Project Settings, then API. Do not commit `.env.local`. Leave `SUPABASE_SERVICE_ROLE_KEY`, `VAPI_WEBHOOK_SECRET`, and `CRON_SECRET` blank until a later phase needs them. `VOICE_PROVIDER_MODE` defaults to `mock`, which places no real calls. Set it to `live` and fill in `VAPI_API_KEY` only when you are ready to dial through Vapi. Never paste secret values into chat, logs, or source files.

3. In the Supabase dashboard, set Authentication, then URL configuration, then Site URL to `http://localhost:3000`.

Email confirmation is on by default. Leave it on and confirm the signup email before logging in, or turn off Authentication, then Providers, then Email, then Confirm email so signup signs you in immediately.

4. Push the schema after the Supabase project exists. Signup and login use Supabase Auth and work before this step. Push before any later phase reads or writes `agents`, `campaigns`, `leads`, `calls`, or `dnc_numbers`.

From the project root, with the Supabase CLI logged in:

```bash
supabase link --project-ref <ref>
supabase db push
```

Replace `<ref>` with the project reference from the dashboard URL or Project Settings, then General. The app does not run these commands.

Phase 2 adds `supabase/migrations/20261022230000_agent_phone_optional.sql`, which lets an agent be saved without a Vapi phone number ID. If you already pushed the first migration, run `supabase db push` again before leaving that field blank.

Phase 3 uses the `leads` and `dnc_numbers` tables from the initial migration. There is no new migration. Open a campaign, choose Leads, and import a CSV or Excel file. Phone numbers are normalized to E.164 with UAE (`AE`) as the default region.

Phase 4 adds `supabase/migrations/20261027120000_agent_variables_and_test_calls.sql`. Run `supabase db push` before saving spoken names, prompt variables, or test calls. On a campaign, use Test call. With `VOICE_PROVIDER_MODE=mock`, refresh the row after a few seconds to see a simulated result.

Phase 5 adds `supabase/migrations/20261028010000_scheduler_claim_leads.sql`. Run `supabase db push` before using the scheduler. Set `CRON_SECRET` in `.env.local`, keep `VOICE_PROVIDER_MODE=mock`, then start the app and run `npm run tick`. A campaign page also has Run scheduler now. The daily limit resets at local midnight.

Phase 6 receives Vapi end-of-call reports and shows them on Calls. Set `VAPI_WEBHOOK_SECRET` in `.env.local` and restart the app. In mock mode, place a test call, copy its provider call id, then run:

```bash
npm run simulate:webhook -- <providerCallId> interested
```

Other outcomes are `not_interested`, `voicemail`, `no_answer`, `callback`, and `dnc`. Sending the same payload again does not change the saved result. Open Calls, then the row, for the summary, transcript, and recording player. Mock mode plays a short generated tone when a recording reference was saved, and shows “No recording for this call” otherwise.

To receive live Vapi events, expose the local app with ngrok or cloudflared (`ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`). In the Vapi dashboard, open Integrations, then Server Configuration, and add a Bearer Token credential: header name `Authorization`, Include Bearer Prefix on, token equal to `VAPI_WEBHOOK_SECRET`. On the assistant, set the Server URL to `https://<your-tunnel>/api/webhooks/vapi` and select that credential. The older `X-Vapi-Secret` header is also accepted if the credential uses that header name and the Bearer prefix is off. Attach the credential on the saved assistant. A server URL supplied only on the outbound API request does not receive the credential.

Create a structured output named “Call outcome” and attach its id in the assistant `artifactPlan.structuredOutputIds`. Schema:

```json
{
  "type": "object",
  "properties": {
    "interested": { "type": "boolean" },
    "interest_level": { "type": "string", "enum": ["high", "medium", "low", "none"] },
    "callback_requested": { "type": "boolean" },
    "callback_time": { "type": "string" },
    "do_not_call": { "type": "boolean" },
    "notes": { "type": "string" }
  }
}
```

The assistant should say it is an AI and that the call may be recorded, then honour a request not to be called. A usable opening line is: “Hi, this is {agent_name}, an AI assistant calling on behalf of {business_name}. This call may be recorded. Do you have a quick minute?”

5. Start the app:

```bash
npm run dev
```

Open http://localhost:3000. You will be asked to log in. After login you should see Dashboard, Agents, Campaigns, Calls, and Settings, and you can log out.

## Scripts

- `npm run dev` starts the local server
- `npm run lint` runs ESLint
- `npm run build` creates a production build
- `npm test` runs Vitest, including the scheduler
- `npm run tick` posts to the local scheduler using `CRON_SECRET` from `.env.local`
- `npm run simulate:webhook -- <providerCallId> [outcome]` posts a mock end-of-call report
