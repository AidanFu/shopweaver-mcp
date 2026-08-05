import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonExistingListingWorkbookFromClient, parseAmazonExistingListingLiveWorkbookArgs, renderAmazonExistingListingLiveWorkbookSummary } from "../src/amazon-existing-listing-live-workbook.js";

describe("parseAmazonExistingListingLiveWorkbookArgs", () => {
  it("parses SKUs, output, marketplace, product type, and summary format", () => {
    expect(parseAmazonExistingListingLiveWorkbookArgs([
      "--skus", "DH-E37S-W6DM,77-UM99-B96T",
      "--output", "/tmp/live-listing-optimization.xlsx",
      "--marketplace-id", "ATVPDKIKX0DER",
      "--product-type", "TOWEL_HOLDER",
      "--sales-signals", "/tmp/sales-signals.json",
      "--format", "summary"
    ])).toEqual({
      skus: ["DH-E37S-W6DM", "77-UM99-B96T"],
      outputPath: "/tmp/live-listing-optimization.xlsx",
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      salesSignalsPath: "/tmp/sales-signals.json",
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonExistingListingLiveWorkbookSummary", () => {
  it("renders a compact live-read summary", () => {
    expect(renderAmazonExistingListingLiveWorkbookSummary({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath: "/tmp/live-listing-optimization.xlsx",
      listingCount: 2,
      optimizedPatchCount: 1,
      applied: false,
      fetchedSkus: ["DH-E37S-W6DM", "77-UM99-B96T"]
    })).toBe([
      "Amazon Existing Listing Live Optimization Workbook",
      "Fetched SKUs: DH-E37S-W6DM, 77-UM99-B96T",
      "Listings: 2 | optimized patches: 1",
      "Output: /tmp/live-listing-optimization.xlsx",
      "Amazon write status: none"
    ].join("\n"));
  });
});

describe("buildAmazonExistingListingWorkbookFromClient", () => {
  it("fetches listing items and writes the local workbook without write calls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-live-listing-cli-"));
    const outputPath = join(dir, "live-listing-optimization.xlsx");
    const salesSignalsPath = join(dir, "sales-signals.json");
    await writeFile(salesSignalsPath, JSON.stringify({
      salesSignals: [{
        sku: "DH-E37S-W6DM",
        signal: "no_ads_or_seller_sales",
        adSpend: 32
      }]
    }));
    const client = {
      getListingItem: vi.fn().mockResolvedValue({
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
      })
    };

    await expect(buildAmazonExistingListingWorkbookFromClient(client, {
      skus: ["DH-E37S-W6DM"],
      outputPath,
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      salesSignalsPath,
      outputFormat: "json"
    })).resolves.toMatchObject({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath,
      listingCount: 1,
      optimizedPatchCount: 1,
      fetchedSkus: ["DH-E37S-W6DM"],
      applied: false
    });

    expect(client.getListingItem).toHaveBeenCalledWith("DH-E37S-W6DM");
    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Optimized Copy"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar, 38 in, Gold Finish"
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Sales Signal Actions"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Signal": "no_ads_or_seller_sales"
    });
  });
});
