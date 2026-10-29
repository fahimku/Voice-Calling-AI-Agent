# Deployment

This file is documentation only. Do not treat it as a command that has already been run. Nothing here deploys the app.

## Where to host

| Option | Fits | Trade-off |
| --- | --- | --- |
| Vercel Hobby | Personal experiments | Hobby is for non-commercial use. Its cron is too limited for a tick every 5 minutes. |
| Vercel Pro | A paying client on Vercel | Commercial use is allowed. You still want an external cron if the built-in cron cannot keep a reliable 5-minute schedule. |
| A small VPS | Client work that should keep running | You run Docker yourself. The scheduler is an external cron, which is the reliable option either way. |

For client work, use Vercel Pro or a small VPS. Do not put a client on the Hobby plan.

### VPS with Docker

`next.config.ts` sets `output: "standalone"`. `Dockerfile` and `docker-compose.yml` build that output and listen on port 3000.

```bash
docker compose up -d --build
```

Put production values in `.env.local` on the server, or pass the same variables in the host environment. The compose file reads `.env.local` and does not copy secret values into the image. The image build ignores `.env*`.

## Scheduler

The app does not call anyone by itself. Something outside the app must `POST /api/scheduler/tick` every 5 minutes with the header `x-cron-secret`.

If `CRON_SECRET` is missing or blank, the route returns 500 and does not place calls. A wrong secret returns 401.

curl:

```bash
curl -X POST "https://<domain>/api/scheduler/tick" \
  -H "x-cron-secret: $CRON_SECRET"
```

n8n:

1. Add a Schedule trigger set to every 5 minutes.
2. Add an HTTP Request node.
3. Method POST, URL `https://<domain>/api/scheduler/tick`.
4. Header name `x-cron-secret`, value from an n8n environment variable or credential. Do not paste the secret into the workflow canvas if the workflow is shared.
5. Timeout 60 seconds. On a non-2xx response, send yourself a notification.
6. Activate the workflow.

cron-job.org, or the VPS crontab, can send the same POST. A host crontab example:

```bash
*/5 * * * * curl -fsS -X POST "https://<domain>/api/scheduler/tick" -H "x-cron-secret: $CRON_SECRET"
```

Keep the secret in the crontab environment, not in the app repository.

## Supabase

Create a production project that is separate from local development. Run `npx supabase db push` against that project after `supabase link`.

`SUPABASE_SERVICE_ROLE_KEY` stays on the server. The browser only receives the publishable anon key. The service role bypasses row level security, so route handlers that use it must check the caller themselves. The dashboard uses the logged-in user, so row level security still applies.

Free Supabase projects can pause after inactivity. Use a paid plan for a client, and turn on backups.

## Production environment

Set these on the host. Never commit real values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOICE_PROVIDER_MODE` (`mock` until the go-live checklist passes, then `live`)
- `VAPI_API_KEY`
- `VAPI_WEBHOOK_SECRET`
- `CRON_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` when a sheet is connected
- `NEXT_PUBLIC_APP_URL` as `https://<domain>` (not localhost)

Rotate `VAPI_WEBHOOK_SECRET` or `CRON_SECRET` by generating a new random value, updating the host and the matching Vapi credential or cron job, then restarting the app. Old requests fail until both sides use the new value. Do not log the old or new value.

`GET /api/health` returns `{ "ok": true, "db": true }` when the app can reach the database. It does not return secrets. A database failure returns 503.

## Vapi live mode

1. Import a Twilio or Telnyx number into Vapi and copy its phone number ID onto the agent.
2. Set the assistant Server URL to `https://<domain>/api/webhooks/vapi`.
3. Attach a Bearer credential whose token is `VAPI_WEBHOOK_SECRET`.
4. Attach the structured output schema from the README (interested, interest level, callback, do-not-call, notes).
5. Set a max call duration, and add the End Call tool so the assistant can hang up.
6. Open `/settings/go-live`. Switch `VOICE_PROVIDER_MODE` to `live` only after that page is all PASS.

The checklist reports PASS or FAIL. It never prints secret values.

## Go-live checklist

- `/settings/go-live` is all PASS.
- `VOICE_PROVIDER_MODE=live` and the app was restarted.
- The external cron returns 200.
- A sheet shared with the service account as Editor, if you write results back.
- The assistant’s opening line says it is an AI and that the call may be recorded.
- Import any existing opt-out numbers in Settings. An empty do-not-call list is a warning, not a failed check.

## First 20 real test calls

Use only phone numbers you own.

1. Create one campaign with a daily limit of 20, a short window you are awake for, and max concurrent 1.
2. Import those 20 numbers. Confirm the preview rejects invalid rows and shows the reason.
3. Place one test call to your phone and confirm the assistant discloses that it is an AI.
4. Let the cron place the rest. Watch Calls for outcome, summary, cost, and recording.
5. Ask one call to opt out and confirm the number lands on the do-not-call list and is skipped later.
6. Confirm the Google Sheet shows the campaign timezone, `None` when interest is none, and a call link on your domain.
7. Pause the campaign when you are done. Use Pause all campaigns on the dashboard if you need every active campaign stopped.

## Compliance

This is not legal advice.

Before a client dials the public, they need to confirm the rules that apply to them, including UAE TDRA rules, any RERA rules for real-estate marketing, and the requirements of their phone carrier.

The product expects all of the following:

- The assistant says it is an AI, and that the call may be recorded, at the start of the call.
- A request not to be called is stored on the do-not-call list and is never dialed again.
- Calls run only inside the campaign window and daily limit.
- The client has a lawful reason to call, such as consent or another basis their counsel accepts.
- The client, not this repository, decides that the campaign is allowed.

A sample opening line is in the README.
