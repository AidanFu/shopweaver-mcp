import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonExistingListingWorkbookFromFile, parseAmazonExistingListingWorkbookArgs, renderAmazonExistingListingWorkbookSummary } from "../src/amazon-existing-listing-workbook.js";

describe("parseAmazonExistingListingWorkbookArgs", () => {
  it("parses input, output, marketplace, product type, and summary format", () => {
    expect(parseAmazonExistingListingWorkbookArgs([
      "--input", "/tmp/listings.json",
      "--output", "/tmp/listing-optimization.xlsx",
      "--marketplace-id", "ATVPDKIKX0DER",
      "--product-type", "TOWEL_HOLDER",
      "--format", "summary"
    ])).toEqual({
      inputPath: "/tmp/listings.json",
      outputPath: "/tmp/listing-optimization.xlsx",
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonExistingListingWorkbookSummary", () => {
  it("renders a compact review-only workbook summary", () => {
    expect(renderAmazonExistingListingWorkbookSummary({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath: "/tmp/listing-optimization.xlsx",
      listingCount: 3,
      optimizedPatchCount: 2,
      applied: false
    })).toBe([
      "Amazon Existing Listing Optimization Workbook",
      "Listings: 3 | optimized patches: 2",
      "Output: /tmp/listing-optimization.xlsx",
      "Amazon write status: none"
    ].join("\n"));
  });
});

describe("buildAmazonExistingListingWorkbookFromFile", () => {
  it("writes the workbook from a local JSON input file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-cli-"));
    const inputPath = join(dir, "listings.json");
    const outputPath = join(dir, "listing-optimization.xlsx");
    await writeFile(inputPath, JSON.stringify({
      listings: [{
        sku: "DH-E37S-W6DM",
        summaries: [{
          itemName: "Vertical Electric Towel Warmer Rack, Wall Mounted, Stainless Steel, Silver, 38 Inch Height, 3 Bar, Digital Timer with LED Display, Plug-in or Hardwired (Gold)",
          mainImage: { link: "https://example.com/main.jpg" }
        }],
        attributes: {
          bullet_point: [
            { value: "Fast warming towel rail for bathroom comfort." },
            { value: "Wall mounted design saves floor space." },
            { value: "Stainless steel construction supports daily use." },
            { value: "Digital timer helps reduce unnecessary run time." },
            { value: "Plug-in or hardwired installation supports different bathrooms." },
            { value: "Extra bullet one." }
          ],
          product_description: [{ value: "A vertical electric towel warmer rack for bathrooms, designed with stainless steel, a digital timer, and flexible plug-in or hardwired installation options." }],
          generic_keyword: [{ value: "Electric Heated Towel Rack" }]
        },
        issues: []
      }]
    }));

    await expect(buildAmazonExistingListingWorkbookFromFile({
      inputPath,
      outputPath,
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      outputFormat: "json"
    })).resolves.toMatchObject({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath,
      listingCount: 1,
      optimizedPatchCount: 1,
      applied: false
    });

    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Patch Preview"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Patch Path": "/attributes/item_name"
    });
  });
});
