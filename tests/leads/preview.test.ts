import { describe, expect, it } from "vitest";

import { detectColumns, mapLeadRows, previewImport } from "@/lib/leads/preview";

const headers = ["Name", "Phone", "City"];
const rows = mapLeadRows(
  headers,
  [
    ["Aisha", "0501234567", "Dubai"],
    ["Omar", "+971501112233", ""],
    ["Aisha again", "0501234567", ""],
    ["Same person", "+971 50 111 2233", ""],
    ["Bad", "123", ""],
    ["Nope", "not-a-number", ""],
    ["", "", ""],
    ["Listed", "+971509998877", ""],
    ["Blocked", "0500000000", ""],
  ],
  0,
  1,
);

describe("detectColumns", () => {
  it("detects name and phone headers", () => {
    expect(detectColumns(["Full Name", "Mobile Number", "Notes"])).toEqual({
      nameIndex: 0,
      phoneIndex: 1,
    });
    expect(detectColumns(["contact", "customer name"])).toEqual({
      nameIndex: 1,
      phoneIndex: 0,
    });
  });
});

describe("previewImport", () => {
  const existing = new Set(["+971501112233"]);
  const dnc = new Set(["+971500000000"]);

  it("classifies valid, invalid, file duplicates, existing duplicates, and DNC rows", () => {
    const preview = previewImport(rows, existing, dnc);

    expect(preview.counts).toEqual({
      valid: 2,
      invalid: 2,
      duplicateFile: 2,
      duplicateExisting: 1,
      dnc: 1,
    });
    expect(preview.insertable).toEqual([
      {
        name: "Aisha",
        phone: "+971501234567",
        rawPhone: "0501234567",
        extra: { City: "Dubai" },
      },
      {
        name: "Listed",
        phone: "+971509998877",
        rawPhone: "+971509998877",
        extra: {},
      },
    ]);
    expect(preview.rows.map((row) => row.status)).toEqual([
      "valid",
      "duplicate_existing",
      "duplicate_file",
      "duplicate_file",
      "invalid",
      "invalid",
      "valid",
      "dnc",
    ]);
    expect(preview.rows[4]?.reason).toBe("Phone number is not a valid number.");
    expect(preview.rows[5]?.reason).toBe("Phone number is not a valid number.");
    expect(preview.rows.find((row) => row.rawName === "Listed")?.name).toBe("Listed");
  });

  it("stores a blank name as null", () => {
    const mapped = mapLeadRows(["Name", "Phone"], [["   ", "0501234567"]], 0, 1);
    const preview = previewImport(mapped, new Set(), new Set());
    expect(preview.insertable[0]?.name).toBeNull();
  });

  it("accepts a numeric sheet phone and keeps the invalid reason on the row", () => {
    const mapped = mapLeadRows(
      ["Name", "Phone"],
      [
        ["Sara", "923001234567"],
        ["Bad", "12345"],
      ],
      0,
      1,
    );
    const preview = previewImport(mapped, new Set(), new Set());
    expect(preview.rows[0]).toMatchObject({
      status: "valid",
      phone: "+923001234567",
      reason: null,
    });
    expect(preview.rows[1]).toMatchObject({
      status: "invalid",
      reason: "Phone number is not a valid number.",
    });
  });
});
