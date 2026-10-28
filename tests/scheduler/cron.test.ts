import { describe, expect, it } from "vitest";

import { authorizeCron } from "@/lib/scheduler/secret";

describe("authorizeCron", () => {
  it("fails closed when the secret is missing or blank and does not accept a header", () => {
    expect(authorizeCron(undefined, "anything")).toEqual({
      ok: false,
      status: 500,
      error: "CRON_SECRET is not configured.",
    });
    expect(authorizeCron("", "anything").status).toBe(500);
    expect(authorizeCron("   ", null).status).toBe(500);
  });

  it("rejects a wrong secret and accepts the configured one", () => {
    expect(authorizeCron("correct-secret", "wrong").status).toBe(401);
    expect(authorizeCron("correct-secret", null).status).toBe(401);
    expect(authorizeCron("correct-secret", "correct-secret")).toEqual({ ok: true });
  });
});
