import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonBrandStoreWorkbookFromFile, parseAmazonBrandStoreArgs, renderAmazonBrandStoreSummary } from "../src/amazon-brand-store.js";

describe("parseAmazonBrandStoreArgs", () => {
  it("parses input, output, and summary format", () => {
    expect(parseAmazonBrandStoreArgs([
      "--input", "/tmp/brand-store-input.json",
      "--output", "/tmp/brand-store.xlsx",
      "--format", "summary"
    ])).toEqual({
      inputPath: "/tmp/brand-store-input.json",
      outputPath: "/tmp/brand-store.xlsx",
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonBrandStoreSummary", () => {
  it("renders a compact workbook result", () => {
    expect(renderAmazonBrandStoreSummary({
      operation: "write_amazon_brand_store_workbook",
      outputPath: "/tmp/brand-store.xlsx",
      productCount: 3
    })).toBe([
      "Amazon Brand Store Workbook",
      "Products: 3",
      "Output: /tmp/brand-store.xlsx",
      "Amazon write status: none"
    ].join("\n"));
  });
});

describe("buildAmazonBrandStoreWorkbookFromFile", () => {
  it("writes the workbook from a local JSON input file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-brand-store-cli-"));
    const inputPath = join(dir, "brand-store-input.json");
    const outputPath = join(dir, "brand-store.xlsx");
    await writeFile(inputPath, JSON.stringify({
      brandName: "Senplus Momokids",
      primaryCategory: "Electric towel warmer racks",
      products: [{
        asin: "B0GDPKVXSZ",
        sku: "DH-E37S-W6DM",
        title: "Electric Towel Warmer Rack",
        finish: "Gold",
        price: 49.99,
        priority: "hero"
      }]
    }));

    await expect(buildAmazonBrandStoreWorkbookFromFile({ inputPath, outputPath, outputFormat: "json" })).resolves.toMatchObject({
      operation: "write_amazon_brand_store_workbook",
      outputPath,
      productCount: 1
    });

    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Store Overview"])[0]).toMatchObject({
      "Brand Name": "Senplus Momokids",
      "Primary Category": "Electric towel warmer racks"
    });
  });
});
