import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeEnrichedWorkbook } from "../src/import/excel.js";
import { parseEnrichedRows, validateEnrichedDraftRow } from "../src/import/enriched.js";

describe("enriched workbook", () => {
  it("writes and parses enriched rows", () => {
    const bytes = writeEnrichedWorkbook([{
      productName: "郁金香兔-紫色",
      rawChineseDescription: "紫色兔子",
      imageFolder: "郁金香兔-紫色",
      imageCount: 4,
      listingGroup: "郁金香兔",
      parentListingTitle: "Handmade Crochet Tulip Bunny",
      parentListingDescription: "A handmade crochet tulip bunny with selectable colors.",
      isVariant: "yes",
      variation1Name: "Color",
      variation1Value: "Purple",
      sku: "tulip-bunny-purple",
      variantPrice: "18.99",
      variantQuantity: 1,
      variantImageFolder: "郁金香兔-紫色",
      variantImageCount: 4,
      validationStatus: "needs_enrichment",
      validationNotes: "Missing English title",
      variationValidationStatus: "ready",
      variationValidationNotes: "Grouped by recognized color suffix."
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0]).toBe("Etsy Drafts");
    const rows = parseEnrichedRows(bytes);
    expect(rows[0]).toMatchObject({
      listingGroup: "郁金香兔",
      parentListingTitle: "Handmade Crochet Tulip Bunny",
      parentListingDescription: "A handmade crochet tulip bunny with selectable colors.",
      isVariant: "yes",
      variation1Name: "Color",
      variation1Value: "Purple",
      sku: "tulip-bunny-purple",
      variantPrice: "18.99",
      variantQuantity: 1,
      variantImageFolder: "郁金香兔-紫色",
      variantImageCount: 4,
      variationValidationStatus: "ready",
      variationValidationNotes: "Grouped by recognized color suffix."
    });
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
