# Calling Agent

Portal for outbound AI calling campaigns. This README covers local setup through Phase 4: the app shell, email auth, agents, campaigns, leads, and test calls.

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

5. Start the app:

```bash
npm run dev
```

Open http://localhost:3000. You will be asked to log in. After login you should see Dashboard, Agents, Campaigns, Calls, and Settings, and you can log out.

## Scripts

- `npm run dev` starts the local server
- `npm run lint` runs ESLint
- `npm run build` creates a production build
- `npm test` runs Vitest, including the agent and campaign validation schemas
