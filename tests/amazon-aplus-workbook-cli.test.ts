import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonAplusWorkbookFromFile, parseAmazonAplusWorkbookArgs, renderAmazonAplusWorkbookSummary } from "../src/amazon-aplus-workbook.js";

describe("parseAmazonAplusWorkbookArgs", () => {
  it("parses input, output, and summary format", () => {
    expect(parseAmazonAplusWorkbookArgs([
      "--input", "/tmp/aplus-input.json",
      "--output", "/tmp/aplus-output.xlsx",
      "--format", "summary"
    ])).toEqual({
      inputPath: "/tmp/aplus-input.json",
      outputPath: "/tmp/aplus-output.xlsx",
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonAplusWorkbookSummary", () => {
  it("renders a compact workbook result", () => {
    expect(renderAmazonAplusWorkbookSummary({
      operation: "write_amazon_aplus_optimization_workbook",
      outputPath: "/tmp/aplus-output.xlsx",
      asinCount: 3
    })).toBe([
      "Amazon A+ Optimization Workbook",
      "ASINs: 3",
      "Output: /tmp/aplus-output.xlsx",
      "Amazon write status: none"
    ].join("\n"));
  });
});

describe("buildAmazonAplusWorkbookFromFile", () => {
  it("writes the workbook from a local JSON input file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-aplus-cli-"));
    const inputPath = join(dir, "aplus-input.json");
    const outputPath = join(dir, "aplus-output.xlsx");
    await writeFile(inputPath, JSON.stringify({
      items: [{
        asin: "B0GDPKVXSZ",
        expectedFinish: "Gold",
        expectedHeightInches: 38,
        sourceContentReferenceKey: "content-key-1",
        contentRecord: {
          contentMetadata: { name: "Existing A+", status: "APPROVED" },
          contentDocument: {
            name: "Existing A+",
            contentType: "EBC",
            locale: "en-US",
            contentModuleList: [{
              contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
              standardProductDescription: {
                body: {
                  textList: [{ value: "This towel warmer has a silver finish and stands 50 inches tall.", decoratorSet: [] }]
                }
              }
            }]
          }
        }
      }]
    }));

    await expect(buildAmazonAplusWorkbookFromFile({ inputPath, outputPath, outputFormat: "json" })).resolves.toMatchObject({
      operation: "write_amazon_aplus_optimization_workbook",
      outputPath,
      asinCount: 1
    });

    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Summary)[0]).toMatchObject({
      "ASIN": "B0GDPKVXSZ",
      "Priority": "high",
      "Source Content Reference Key": "content-key-1"
    });
  });
});
