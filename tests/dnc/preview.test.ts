import { describe, expect, it } from "vitest";

import { collectDncCells, previewDncImport } from "@/lib/dnc/preview";

describe("do-not-call CSV preview", () => {
  it("reads a Phone column and a single column of numbers", () => {
    const headed = collectDncCells(["Name", "Phone"], [["Amina", "0501234567"]]);
    expect("cells" in headed && headed.cells).toEqual([{ rowNumber: 2, raw: "0501234567" }]);

    const bare = collectDncCells(["0501234567"], [["923001234567"]]);
    expect("cells" in bare && bare.cells.map((cell) => cell.raw)).toEqual(["0501234567", "923001234567"]);
  });

  it("normalizes with isValid, dedupes, and rejects fake numbers", () => {
    const preview = previewDncImport(
      [
        { rowNumber: 2, raw: "0501234567" },
        { rowNumber: 3, raw: "0501234567" },
        { rowNumber: 4, raw: "+971509998877" },
        { rowNumber: 5, raw: "12345465767" },
        { rowNumber: 6, raw: "56565656565" },
        { rowNumber: 7, raw: "1234546576786" },
        { rowNumber: 8, raw: "923001234567" },
      ],
      new Set(["+971509998877"]),
    );

    expect(preview.counts).toEqual({ valid: 2, invalid: 3, duplicateFile: 1, duplicateExisting: 1 });
    expect(preview.insertable).toEqual(["+971501234567", "+923001234567"]);
    expect(preview.rows.find((row) => row.raw === "12345465767")?.reason).toBe("Phone number is not a valid number.");
    expect(preview.rows.find((row) => row.raw === "56565656565")?.status).toBe("invalid");
    expect(preview.rows.find((row) => row.raw === "1234546576786")?.status).toBe("invalid");
    expect(preview.rows.find((row) => row.rowNumber === 3)?.reason).toBe("Duplicate in this file.");
    expect(preview.rows.find((row) => row.raw === "+971509998877")?.reason).toBe("Already on your do-not-call list.");
  });
});