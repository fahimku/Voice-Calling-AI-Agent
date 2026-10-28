import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { leadInsertRow } from "@/lib/leads/insert-row";
import { batchWriteRows, verifyAccess, type SheetsApi, type ValueRange } from "@/lib/sheets/api";
import { callLink, sanitizeSheetCell, sheetDateTime, sheetInterest } from "@/lib/sheets/cells";
import { privateKeyFromEnv, serviceAccountCredentials, type SheetRuntime } from "@/lib/sheets/env";
import { DEFAULT_HEADERS, planHeaders, RESULT_HEADERS } from "@/lib/sheets/headers";
import { parseSheetId } from "@/lib/sheets/parse";
import { planSheetWrite, type DirtyLead } from "@/lib/sheets/plan";
import { publicSheetError, withSheetsRetry } from "@/lib/sheets/retry";
import { syncCampaignToSheet, syncDirtyCampaigns, type SheetSyncStore } from "@/lib/sheets/sync";

const sheetId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const callId = "550e8400-e29b-41d4-a716-446655440000";
const secret = "SUPERSECRETKEYMATERIAL1234567890";

function lead(partial: Partial<DirtyLead> = {}): DirtyLead {
  return {
    id: "lead-1",
    name: "Amina",
    phone: "+971501234567",
    status: "Interested",
    interest: "High",
    callbackAt: "",
    attempts: 1,
    lastCallAt: "28 Oct 2026, 18:00",
    summary: "Asked about the class.",
    notes: "Wants Saturday.",
    sheetRow: null,
    callId,
    ...partial,
  };
}

function runtime(partial: Partial<SheetRuntime> = {}): SheetRuntime {
  return {
    email: "svc@example.com",
    privateKey: secret,
    appUrl: "https://app.example.com",
    secrets: [secret],
    updatedAt: "2026-10-28T14:00:00.000Z",
    ...partial,
  };
}

function api(partial: Partial<SheetsApi> = {}): SheetsApi {
  return {
    async getSpreadsheet() {
      return { titles: ["Leads"] };
    },
    async getValues() {
      return [DEFAULT_HEADERS];
    },
    async batchUpdate() {},
    async append() {
      return { startRow: 2 };
    },
    ...partial,
  };
}

describe("parseSheetId", () => {
  it("accepts sheet URLs and a raw id, and rejects garbage", () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`)).toBe(sheetId);
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing`)).toBe(sheetId);
    expect(parseSheetId(sheetId)).toBe(sheetId);
    expect(parseSheetId("")).toBeNull();
    expect(parseSheetId("not a sheet")).toBeNull();
    expect(parseSheetId("https://example.com/spreadsheets/d/short/edit")).toBeNull();
    expect(parseSheetId("https://docs.google.com/document/d/abcdefghijabcdefghij/edit")).toBeNull();
  });
});

describe("sheet timestamps and interest", () => {
  it("writes timestamps in the campaign timezone and labels none as None", () => {
    expect(sheetDateTime("2026-10-28T22:49:00.000Z", "Asia/Dubai")).toBe("29 Oct 2026, 02:49");
    expect(sheetDateTime("2026-10-28T22:49:00.000Z", "UTC")).toBe("28 Oct 2026, 22:49");
    expect(sheetDateTime("2026-10-28T22:49:00.000Z", "Asia/Kolkata")).toBe("29 Oct 2026, 04:19");
    expect(sheetDateTime(null, "Asia/Dubai")).toBe("");
    expect(sheetInterest("none")).toBe("None");
    expect(sheetInterest("high")).toBe("High");
    expect(sheetInterest(null)).toBe("");
  });
});

describe("headers and cells", () => {
  it("keeps existing Name and Phone columns and adds result columns on the right", () => {
    const empty = planHeaders([]);
    expect(empty.headers).toEqual(DEFAULT_HEADERS);
    expect(empty.changed).toBe(true);
    expect(empty.nameIndex).toBe(0);
    expect(empty.phoneIndex).toBe(1);

    const existing = planHeaders(["Customer", "NAME", "Email", "Phone Number"]);
    expect(existing.nameIndex).toBe(1);
    expect(existing.phoneIndex).toBe(3);
    expect(existing.headers.slice(0, 4)).toEqual(["Customer", "NAME", "Email", "Phone Number"]);
    expect(existing.headers.slice(4)).toEqual([...RESULT_HEADERS]);
    expect(planHeaders(DEFAULT_HEADERS).changed).toBe(false);
  });

  it("prefixes formula characters and truncates long cells", () => {
    expect(sanitizeSheetCell("=cmd")).toBe("'=cmd");
    expect(sanitizeSheetCell("+971")).toBe("'+971");
    expect(sanitizeSheetCell("-1")).toBe("'-1");
    expect(sanitizeSheetCell("@sum")).toBe("'@sum");
    expect(sanitizeSheetCell("\t=cmd")).toBe("'\t=cmd");
    expect(sanitizeSheetCell("\r=cmd")).toBe("'\r=cmd");
    expect(sanitizeSheetCell("Hello")).toBe("Hello");
    expect(sanitizeSheetCell("a".repeat(2500))).toHaveLength(2000);
    expect(sanitizeSheetCell(`=${"a".repeat(2500)}`)).toHaveLength(2001);
    expect(sanitizeSheetCell("See https://api.vapi.ai/recording/secret-file")).not.toContain("vapi.ai");
    expect(sanitizeSheetCell("See https://api.vapi.ai/recording/secret-file")).not.toContain("recording");
  });

  it("writes a login call link and never a recording url", () => {
    expect(callLink("https://app.example.com/", callId)).toBe(`https://app.example.com/calls/${callId}`);
    expect(callLink("https://app.example.com", "vapi:recording")).toBe("");
    expect(callLink(undefined, callId)).toBe("");
  });
});

describe("sheet write plan", () => {
  it("matches an existing phone and leaves Name and Phone cells alone", () => {
    const layout = planHeaders(["Customer", "Name", "Email", "Phone"]);
    const plan = planSheetWrite({
      tab: "Leads",
      layout,
      rows: [{ sheetRow: 4, cells: ["Acme", "Amina", "a@example.com", "0501234567"] }],
      leads: [lead({ name: "Overwrite me", summary: "Listen at https://files.example/recording/secret.wav" })],
      appUrl: "https://app.example.com",
      updatedAt: "28 Oct 2026, 18:08",
    });
    expect(plan.appends).toHaveLength(0);
    expect(plan.updates.map((row) => row.sheetRow)).toEqual([4]);
    const serialized = JSON.stringify(plan.updates);
    expect(serialized).not.toContain("Overwrite me");
    expect(serialized).not.toContain("recording");
    expect(serialized).toContain(`https://app.example.com/calls/${callId}`);
    expect(plan.updates[0]?.ranges.every((range) => !range.range.includes("!B") && !range.range.includes("!D"))).toBe(true);

    const again = planSheetWrite({
      tab: "Leads",
      layout,
      rows: [{ sheetRow: 4, cells: ["Acme", "Amina", "a@example.com", "+971501234567"] }],
      leads: [lead({ sheetRow: 4 })],
      appUrl: "https://app.example.com",
      updatedAt: "28 Oct 2026, 18:08",
    });
    expect(again.appends).toHaveLength(0);
    expect(again.updates).toHaveLength(1);
  });

  it("appends one row when the phone is not on the sheet", () => {
    const layout = planHeaders([]);
    const plan = planSheetWrite({
      tab: "Leads",
      layout,
      rows: [],
      leads: [lead(), lead({ id: "lead-2" })],
      appUrl: "https://app.example.com",
      updatedAt: "28 Oct 2026, 18:08",
    });
    expect(plan.appends).toHaveLength(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.appends[0]?.values[0]).toBe("Amina");
    expect(plan.appends[0]?.values[1]?.startsWith("'")).toBe(true);
  });
});

describe("batching and retry", () => {
  it("sends row updates in batches of 100", async () => {
    const calls: ValueRange[][] = [];
    const rows = Array.from({ length: 150 }, (_, index) => ({ range: `Leads!C${index + 2}`, values: [["Ok"]] }));
    await batchWriteRows(
      api({
        async batchUpdate(_sheetId, data) {
          calls.push(data);
        },
      }),
      sheetId,
      rows,
    );
    expect(calls.map((batch) => batch.length)).toEqual([100, 50]);
  });

  it("retries 429 and 5xx with exponential backoff", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const result = await withSheetsRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("slow down"), { code: attempts === 1 ? 429 : 503 });
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toEqual([200, 400]);

    await expect(withSheetsRetry(async () => {
      throw Object.assign(new Error("missing"), { response: { status: 404 } });
    })).rejects.toThrow("missing");
  });
});

describe("sync", () => {
  it("keeps sheet_dirty when the write fails and hides secrets", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dirty = [lead({ sheetRow: 2 })];
    let storedError = "";
    let cleared = false;
    const store: SheetSyncStore = {
      async loadCampaign() {
        return { id: "camp-1", sheetId, tab: "Leads" };
      },
      async loadDirty() {
        return dirty;
      },
      async markSynced() {
        cleared = true;
        dirty.length = 0;
      },
      async markFailed(_id, message) {
        storedError = message;
      },
      async listConnectedDirty() {
        return ["camp-1"];
      },
    };
    const pem = `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`;
    const result = await syncCampaignToSheet(
      store,
      api({
        async batchUpdate() {
          throw new Error(`quota ${secret} ${pem}`);
        },
      }),
      "camp-1",
      runtime({ log: (message) => logs.push(message), secrets: [secret, pem] }),
    );
    expect(result.error).toBeTruthy();
    expect(cleared).toBe(false);
    expect(dirty).toHaveLength(1);
    expect(storedError).not.toContain(secret);
    expect(storedError).not.toContain("BEGIN PRIVATE KEY");
    expect(logs.join(" ")).not.toContain(secret);
    expect(spy.mock.calls.flat().join(" ")).not.toContain(secret);
    spy.mockRestore();
  });

  it("continues when one campaign fails and does not append a second row", async () => {
    const synced: string[] = [];
    const failed: string[] = [];
    const appends: string[] = [];
    const dirty = {
      bad: [lead()],
      good: [lead({ id: "lead-good", sheetRow: 3 })],
    };
    const store: SheetSyncStore = {
      async loadCampaign(id) {
        return { id, sheetId: id === "bad" ? "bad-sheet-id-000000000000" : sheetId, tab: "Leads" };
      },
      async loadDirty(id) {
        return dirty[id as "bad" | "good"] ?? [];
      },
      async markSynced(id) {
        synced.push(id);
        dirty[id as "bad" | "good"] = [];
      },
      async markFailed(id) {
        failed.push(id);
      },
      async listConnectedDirty() {
        return ["bad", "good"];
      },
    };
    const results = await syncDirtyCampaigns(
      store,
      api({
        async getSpreadsheet(id) {
          if (id.startsWith("bad")) throw Object.assign(new Error("forbidden"), { code: 403 });
          return { titles: ["Leads"] };
        },
        async append(id) {
          appends.push(id);
          return { startRow: 2 };
        },
      }),
      runtime(),
    );
    expect(results.map((result) => result.campaignId)).toEqual(["bad", "good"]);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toContain("Share the sheet with svc@example.com as Editor.");
    expect(failed).toEqual(["bad"]);
    expect(synced).toEqual(["good"]);
    expect(appends).toEqual([]);

    const replay = await syncCampaignToSheet(store, api(), "good", runtime());
    expect(replay.skipped).toBe(true);
    expect(appends).toEqual([]);
  });

  it("describes a missing sheet, a missing tab, and access errors", async () => {
    await expect(
      verifyAccess(
        api({
          async getSpreadsheet() {
            throw Object.assign(new Error("gone"), { response: { status: 404 } });
          },
        }),
        sheetId,
        "Leads",
        "svc@example.com",
      ),
    ).rejects.toThrow("not found");
    await expect(verifyAccess(api({ async getSpreadsheet() { return { titles: ["Other"] }; } }), sheetId, "Leads", "svc@example.com")).rejects.toThrow(
      'The tab "Leads" is missing.',
    );
  });
});

describe("import rows and claim flag", () => {
  it("stores the sheet row only for rows imported from the sheet", () => {
    expect(leadInsertRow("camp-1", { name: "Amina", phone: "+971501234567", extra: {}, sheetRow: 4 })).toMatchObject({
      sheet_row: 4,
      phone_e164: "+971501234567",
    });
    expect(leadInsertRow("camp-1", { name: null, phone: "+971501234567", extra: {} })).not.toHaveProperty("sheet_row");
  });

  it("marks claimed leads dirty without moving the lock", () => {
    const sql = readFileSync("supabase/migrations/20261028150000_google_sheets.sql", "utf8");
    const lock = sql.indexOf("perform pg_advisory_xact_lock");
    const usage = sql.indexOf("v_used := public.campaign_calls_used_today");
    const rows = sql.toLowerCase().indexOf("for update skip locked");
    expect(sql).toContain("sheet_tab text default 'Leads'");
    expect(sql).toContain("sheet_dirty boolean not null default false");
    expect(sql).toContain("sheet_dirty = true");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(usage);
    expect(usage).toBeLessThan(rows);
  });
});

describe("service account key", () => {
  it("turns literal newline sequences into real newlines", () => {
    const key = "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----";
    expect(privateKeyFromEnv(key)).toBe("-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----");
    const credentials = serviceAccountCredentials("svc@example.com", key);
    expect(credentials.key).toContain("\nABC\n");
    expect(credentials.scopes).toEqual(["https://www.googleapis.com/auth/spreadsheets"]);
    expect(publicSheetError(new Error(`failed ${credentials.key}`), [credentials.key])).not.toContain("ABC");
  });
});
