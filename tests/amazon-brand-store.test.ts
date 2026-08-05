import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildAmazonBrandStorePlan, writeAmazonBrandStoreWorkbook } from "../src/amazon/brand-store.js";

describe("buildAmazonBrandStorePlan", () => {
  it("builds a benefit-led Brand Store plan from product and campaign context", () => {
    const plan = buildAmazonBrandStorePlan({
      brandName: "Senplus Momokids",
      primaryCategory: "Electric towel warmer racks",
      products: [{
        asin: "B0GDPKVXSZ",
        sku: "DH-E37S-W6DM",
        title: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
        finish: "Gold",
        price: 49.99,
        priority: "hero"
      }],
      campaignInsights: {
        efficientSearchTerms: ["electric towel warmer gold"],
        wasteSearchTerms: ["free towel warmer manual"]
      }
    });
    expect(plan).toMatchObject({
      operation: "build_amazon_brand_store_plan",
      brandName: "Senplus Momokids",
      productCount: 1,
      productTiles: [
        {
          asin: "B0GDPKVXSZ",
          primaryMessage: "Gold finish for a polished bathroom upgrade"
        }
      ],
      warning: "Review only. No Amazon Brand Store, A+ Content, listing, or Ads change was submitted."
    });
    expect(plan.sections[0]).toMatchObject({
      sectionType: "hero",
      headline: "Warmer, drier towels for everyday bathroom routines"
    });
    expect(plan.adLearningHooks[0]).toMatchObject({
      signal: "efficient_search_terms",
      recommendation: "Use converting Sponsored Products terms in Store headline and tile copy: electric towel warmer gold."
    });
  });

  it("uses Ads and Seller sales signals to guide Brand Store product tiles", () => {
    const plan = buildAmazonBrandStorePlan({
      brandName: "Senplus Momokids",
      primaryCategory: "Electric towel warmer racks",
      products: [{
        asin: "B0GDPKVXSZ",
        sku: "DH-E37S-W6DM",
        title: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
        finish: "Gold",
        price: 49.99
      }, {
        asin: "B0GD7T3YGK",
        sku: "5H-2EH1-7H77",
        title: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Silver",
        finish: "Silver",
        price: 49.99
      }],
      salesSignals: [{
        sku: "DH-E37S-W6DM",
        signal: "no_ads_or_seller_sales",
        adSpend: 32,
        sellerOrders: 0,
        adsOrders: 0
      }, {
        sku: "5H-2EH1-7H77",
        signal: "matched_ads_and_seller_sales",
        adSpend: 18,
        sellerOrders: 1,
        adsOrders: 1
      }]
    });

    expect(plan.productTiles).toMatchObject([{
      sku: "5H-2EH1-7H77",
      primaryMessage: "Polished Chrome finish for a polished bathroom upgrade",
      storeRole: "lead_tile",
      salesSignal: "matched_ads_and_seller_sales",
      callout: "Feature early in the Store because Ads and Seller orders both show recent demand."
    }, {
      sku: "DH-E37S-W6DM",
      storeRole: "diagnostic_tile",
      salesSignal: "no_ads_or_seller_sales",
      callout: "Keep visible for comparison, but review listing promise, image, price, and campaign traffic before making it the hero tile."
    }]);
    expect(plan.adLearningHooks).toContainEqual({
      signal: "store_sales_signal_review",
      recommendation: "Use Store tile order to protect proven sellers first, then diagnose no-sale SKUs before giving them hero placement."
    });
  });
});

describe("writeAmazonBrandStoreWorkbook", () => {
  it("writes a review workbook for Brand Store planning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-brand-store-"));
    const outputPath = join(dir, "brand-store.xlsx");
    await expect(writeAmazonBrandStoreWorkbook({
      outputPath,
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
    })).resolves.toMatchObject({
      operation: "write_amazon_brand_store_workbook",
      outputPath,
      productCount: 1
    });

    const workbook = XLSX.readFile(outputPath);
    expect(workbook.SheetNames).toEqual(["Store Overview", "Homepage Sections", "Product Tiles", "Ads Learning Hooks"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Homepage Sections"])[0]).toMatchObject({
      "Section Type": "hero",
      "Headline": "Warmer, drier towels for everyday bathroom routines"
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Product Tiles"])[0]).toMatchObject({
      "ASIN": "B0GDPKVXSZ",
      "Primary Message": "Gold finish for a polished bathroom upgrade"
    });
  });
});
