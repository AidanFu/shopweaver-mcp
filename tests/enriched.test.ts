import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeEnrichedWorkbook } from "../src/import/excel.js";
import { parseEnrichedRows, validateEnrichedDraftRow } from "../src/import/enriched.js";

describe("enriched workbook", () => {
  it("writes and parses enriched rows", () => {
    const bytes = writeEnrichedWorkbook([{
      productName: "产品一",
      rawChineseDescription: "中文描述",
      imageFolder: "产品一",
      imageCount: 2,
      validationStatus: "needs_enrichment",
      validationNotes: "Missing English title"
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0]).toBe("Etsy Drafts");
    const rows = parseEnrichedRows(bytes);
    expect(rows[0]).toMatchObject({ productName: "产品一", rawChineseDescription: "中文描述", imageCount: 2 });
  });

  it("validates required physical draft fields", () => {
    expect(validateEnrichedDraftRow({
      productName: "产品一",
      englishTitle: "Handmade Bowl",
      englishDescription: "A handmade decorative bowl.",
      quantity: 1,
      price: "12.00",
      taxonomyId: 123,
      whoMade: "i_did",
      whenMade: "2020_2026",
      type: "physical",
      readinessStateId: 456,
      imageFolder: "产品一",
      imageCount: 2
    })).toEqual([]);
  });
});
