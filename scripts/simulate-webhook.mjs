import { readFileSync } from "node:fs";

function envValue(name) {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    if (line.slice(0, index) === name) return line.slice(index + 1);
  }
  return "";
}

const providerCallId = process.argv[2];
const outcome = process.argv[3] ?? "interested";
const allowed = ["interested", "not_interested", "voicemail", "no_answer", "callback", "dnc"];

if (!providerCallId || !allowed.includes(outcome)) {
  console.error("Usage: npm run simulate:webhook -- <providerCallId> [interested|not_interested|voicemail|no_answer|callback|dnc]");
  process.exit(1);
}

const secret = envValue("VAPI_WEBHOOK_SECRET");
if (!secret) {
  console.error("VAPI_WEBHOOK_SECRET is missing from .env.local");
  process.exit(1);
}

const structured = {
  interested: outcome === "interested" || outcome === "callback",
  interest_level: outcome === "interested" ? "high" : outcome === "callback" ? "medium" : "none",
  callback_requested: outcome === "callback",
  callback_time: outcome === "callback" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
  do_not_call: outcome === "dnc",
  notes:
    outcome === "dnc"
      ? "Asked not to be called again."
      : outcome === "callback"
        ? "Asked for a callback."
        : "Simulated end of call.",
};

const endedReason =
  outcome === "voicemail" ? "voicemail" : outcome === "no_answer" ? "customer-did-not-answer" : "customer-ended-call";
const endedAt = new Date().toISOString();
const startedAt = new Date(Date.now() - 45_000).toISOString();

const payload = {
  message: {
    type: "end-of-call-report",
    endedReason,
    call: {
      id: providerCallId,
      startedAt,
      endedAt,
      customer: { number: "+971501234567" },
    },
    analysis: { summary: structured.notes },
    artifact: {
      transcript: "Assistant: Hi, this is a simulated call.\nCustomer: Thanks.",
      recording: { url: "https://example.invalid/private-recording.wav" },
      structuredOutputs: {
        "00000000-0000-4000-8000-000000000001": {
          name: "Call outcome",
          result: structured,
        },
      },
    },
  },
};

let response;
try {
  response = await fetch("http://localhost:3000/api/webhooks/vapi", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
} catch {
  console.error("Could not reach http://localhost:3000. Start the app with npm run dev, then run this again.");
  process.exit(1);
}

console.log(response.status);
console.log(await response.text());
if (!response.ok) process.exit(1);
