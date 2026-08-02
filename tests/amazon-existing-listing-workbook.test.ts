import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { previewAmazonExistingListingApprovedCopyUpdates, readAmazonExistingListingCopyDecisions, writeAmazonExistingListingOptimizationWorkbook } from "../src/amazon/listing-optimization-workbook.js";

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
    expect(workbook.SheetNames).toEqual(["Summary", "Recommendations", "Optimized Copy", "Decision Options", "Patch Preview"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Summary)[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Status": "needs_listing_optimization",
      "Priority": "normal",
      "Seller Approval Required": true
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Optimized Copy"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      "Bullet Count": 5,
      "Decision": ""
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Decision Options"])).toEqual([
      { "Decision": "approve", "Meaning": "Approved for a future Amazon listing copy write after a final confirmation gate." },
      { "Decision": "reject", "Meaning": "Do not apply this listing copy recommendation." },
      { "Decision": "defer", "Meaning": "Review again after more listing, sales, or advertising data is available." }
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Patch Preview"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Patch Path": "/attributes/item_name",
      "Value Count": 1
    });
  });

  it("reads approved listing copy decisions from a reviewed workbook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-decisions-"));
    const file = join(dir, "reviewed-listings.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        "SKU": "DH-E37S-W6DM",
        "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
        "Bullet 1": "Benefit one.",
        "Bullet 2": "Benefit two.",
        "Bullet 3": "Benefit three.",
        "Bullet 4": "Worry reducer.",
        "Bullet 5": "Post-sale support.",
        "Optimized Description": "Optimized bathroom comfort description.",
        "Optimized Backend Search Terms": "heated towel rail bathroom towel dryer wall towel warmer",
        "Decision": "Approve",
        "Reviewed By": "Aidan",
        "Review Notes": "Apply after final preview"
      },
      {
        "SKU": "77-UM99-B96T",
        "Optimized Title": "Skip Me",
        "Decision": "approved"
      }
    ]), "Optimized Copy");
    XLSX.writeFile(workbook, file);

    await expect(readAmazonExistingListingCopyDecisions(file)).resolves.toEqual({
      operation: "read_amazon_existing_listing_copy_decisions",
      reviewedListingCount: 1,
      invalidDecisionCount: 1,
      decisions: [{
        sku: "DH-E37S-W6DM",
        title: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
        bullets: ["Benefit one.", "Benefit two.", "Benefit three.", "Worry reducer.", "Post-sale support."],
        description: "Optimized bathroom comfort description.",
        backendSearchTerms: "heated towel rail bathroom towel dryer wall towel warmer",
        decision: "approve",
        reviewedBy: "Aidan",
        reviewNotes: "Apply after final preview"
      }],
      invalidDecisions: [{
        sku: "77-UM99-B96T",
        decision: "approved",
        reviewNotes: "",
        error: "Decision must be approve, reject, or defer."
      }]
    });
  });

  it("previews approved listing copy patches from a reviewed workbook without applying changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-preview-"));
    const file = join(dir, "reviewed-listings.xlsx");
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
    XLSX.writeFile(workbook, file);

    const preview = await previewAmazonExistingListingApprovedCopyUpdates(file, {
      marketplaceId: "ATVPDKIKX0DER",
      productType: "TOWEL_HOLDER"
    });
    expect(preview).toMatchObject({
      operation: "preview_amazon_existing_listing_approved_copy_updates",
      approvedListingCount: 1,
      applied: false,
      warning: "Preview only. No Amazon listing title, bullets, description, backend search terms, images, offers, inventory, or ads were changed.",
      patches: [{
        sku: "DH-E37S-W6DM",
        patch: {
          productType: "TOWEL_HOLDER"
        }
      }]
    });
    expect(preview.patches[0]?.patch.patches[0]).toMatchObject({
      path: "/attributes/item_name",
      value: [{ value: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold", marketplace_id: "ATVPDKIKX0DER" }]
    });
  });
});
