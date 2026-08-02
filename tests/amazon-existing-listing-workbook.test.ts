import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeAmazonExistingListingOptimizationWorkbook } from "../src/amazon/listing-optimization-workbook.js";

describe("writeAmazonExistingListingOptimizationWorkbook", () => {
  it("writes review-only recommendations and optimized copy patches for existing listings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-"));
    const outputPath = join(dir, "existing-listing-optimization.xlsx");
    await expect(writeAmazonExistingListingOptimizationWorkbook({
      outputPath,
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
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
    })).resolves.toMatchObject({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath,
      listingCount: 1,
      optimizedPatchCount: 1,
      applied: false
    });

    const workbook = XLSX.readFile(outputPath);
    expect(workbook.SheetNames).toEqual(["Summary", "Recommendations", "Optimized Copy", "Patch Preview"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Summary)[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Status": "needs_listing_optimization",
      "Priority": "normal",
      "Seller Approval Required": true
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Optimized Copy"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      "Bullet Count": 5
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Patch Preview"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Patch Path": "/attributes/item_name",
      "Value Count": 1
    });
  });
});
