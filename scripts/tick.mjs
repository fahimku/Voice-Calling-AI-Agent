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

const secret = envValue("CRON_SECRET");
if (!secret) {
  console.error("CRON_SECRET is missing from .env.local");
  process.exit(1);
}

let response;
try {
  response = await fetch("http://localhost:3000/api/scheduler/tick", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
} catch {
  console.error("Could not reach http://localhost:3000. Start the app with npm run dev, then run npm run tick again.");
  process.exit(1);
}
const body = await response.text();
console.log(response.status);
console.log(body);
if (!response.ok) process.exit(1);
