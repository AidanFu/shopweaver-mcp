import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonExistingListingReviewResult, parseAmazonExistingListingReviewArgs, renderAmazonExistingListingReviewSummary } from "../src/amazon-existing-listing-review.js";

describe("parseAmazonExistingListingReviewArgs", () => {
  it("parses decision-review preview arguments", () => {
    expect(parseAmazonExistingListingReviewArgs([
      "--mode", "preview",
      "--file", "/tmp/reviewed-listings.xlsx",
      "--marketplace-id", "ATVPDKIKX0DER",
      "--product-type", "TOWEL_HOLDER",
      "--format", "summary"
    ])).toEqual({
      mode: "preview",
      filePath: "/tmp/reviewed-listings.xlsx",
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonExistingListingReviewSummary", () => {
  it("renders a compact approved patch preview summary", () => {
    expect(renderAmazonExistingListingReviewSummary({
      operation: "preview_amazon_existing_listing_approved_copy_updates",
      approvedListingCount: 2,
      invalidDecisionCount: 1,
      applied: false,
      patches: [{ sku: "DH-E37S-W6DM" }, { sku: "77-UM99-B96T" }]
    })).toBe([
      "Amazon Existing Listing Review",
      "Operation: preview_amazon_existing_listing_approved_copy_updates",
      "Approved listings: 2 | invalid decisions: 1",
      "SKUs: DH-E37S-W6DM, 77-UM99-B96T",
      "Amazon write status: none"
    ].join("\n"));
  });
});

describe("buildAmazonExistingListingReviewResult", () => {
  it("builds a patch preview from a reviewed workbook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-listing-review-cli-"));
    const filePath = join(dir, "reviewed-listings.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      "Bullet 1": "Benefit one.",
      "Bullet 2": "Benefit two.",
      "Bullet 3": "Benefit three.",
      "Bullet 4": "Worry reducer.",
      "Bullet 5": "Post-sale support.",
      "Optimized Description": "Optimized bathroom comfort description.",
      "Optimized Backend Search Terms": "heated towel rail bathroom towel dryer wall towel warmer",
      "Decision": "approve"
    }]), "Optimized Copy");
    XLSX.writeFile(workbook, filePath);

    await expect(buildAmazonExistingListingReviewResult({
      mode: "preview",
      filePath,
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER",
      outputFormat: "json"
    })).resolves.toMatchObject({
      operation: "preview_amazon_existing_listing_approved_copy_updates",
      approvedListingCount: 1,
      applied: false,
      patches: [{
        sku: "DH-E37S-W6DM",
        patch: {
          productType: "TOWEL_HOLDER"
        }
      }]
    });
  });
});
