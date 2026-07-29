import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeAmazonAplusOptimizationWorkbook } from "../src/amazon/aplus-workbook.js";

describe("writeAmazonAplusOptimizationWorkbook", () => {
  it("writes a review workbook with optimized A+ copy for each variation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-aplus-"));
    const output = join(dir, "aplus-optimization.xlsx");

    await expect(writeAmazonAplusOptimizationWorkbook({
      outputPath: output,
      items: [
        {
          asin: "B0GDPKVXSZ",
          expectedFinish: "Gold",
          expectedHeightInches: 38,
          sourceContentReferenceKey: "gold-content",
          contentRecord: aplusContentRecord()
        },
        {
          asin: "B0GD89SVK9",
          expectedFinish: "Black",
          expectedHeightInches: 38,
          sourceContentReferenceKey: "black-content",
          contentRecord: aplusContentRecord()
        }
      ]
    })).resolves.toMatchObject({
      operation: "write_amazon_aplus_optimization_workbook",
      outputPath: output,
      asinCount: 2
    });

    const workbook = XLSX.readFile(output);
    expect(workbook.SheetNames).toEqual(["Summary", "Recommendations", "Proposed Module Plan", "Product Description", "Optimized Overlay Copy"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Summary)[0]).toMatchObject({
      "ASIN": "B0GDPKVXSZ",
      "Finish": "Gold",
      "Source Content Reference Key": "gold-content",
      "Priority": "high",
      "Empty Overlay Modules": 1,
      "Generic Alt Text": 1
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Optimized Overlay Copy"])[0]).toMatchObject({
      "ASIN": "B0GDPKVXSZ",
      "Module Index": 1,
      "Headline": "Warmer, drier towels after daily showers",
      "Alt Text": "Gold electric towel warmer shown in a bathroom use case"
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Product Description"])[1]).toMatchObject({
      "ASIN": "B0GD89SVK9",
      "Description": expect.stringContaining("polished Black finish")
    });
  });
});

function aplusContentRecord() {
  return {
    contentMetadata: { name: "momokids 3 vertical round", status: "APPROVED" },
    contentDocument: {
      name: "momokids 3 vertical round",
      contentType: "EBC",
      locale: "en-US",
      contentModuleList: [
        {
          contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
          standardProductDescription: {
            body: {
              textList: [{ value: "This towel warmer has a silver finish and stands 50 inches tall.", decoratorSet: [] }]
            }
          }
        },
        {
          contentModuleType: "STANDARD_IMAGE_TEXT_OVERLAY",
          standardImageTextOverlay: {
            block: {
              image: { uploadDestinationId: "image-1", altText: "3v-round-1" },
              headline: { value: "", decoratorSet: [] },
              body: { textList: [{ value: "", decoratorSet: [] }] }
            }
          }
        }
      ]
    }
  };
}
