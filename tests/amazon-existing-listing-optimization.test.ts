import { describe, expect, it } from "vitest";
import { analyzeAmazonExistingListing } from "../src/amazon/listing-optimization.js";

describe("analyzeAmazonExistingListing", () => {
  it("recommends review-only listing improvements from existing Amazon listing data", () => {
    expect(analyzeAmazonExistingListing({
      sku: "AMZ-HMF-0001",
      summaries: [{ itemName: "Cute Bunny", mainImage: { link: "" } }],
      attributes: {
        bullet_point: [{ value: "Handmade" }, { value: "Cute gift" }],
        product_description: [{ value: "Small charm." }]
      },
      issues: [{ code: "MISSING_ATTRIBUTE", message: "Missing recommended attribute: color" }]
    })).toEqual({
      sku: "AMZ-HMF-0001",
      status: "needs_listing_optimization",
      priority: "high",
      titleRecommendation: "Rewrite title with product type, use case, and core buyer search terms.",
      bulletRecommendation: "Expand to five benefit-led bullets: three buyer benefits, one worry reducer, and one post-sale/giftability point.",
      imageRecommendation: "Review main image and add scale, use-case, and detail images before increasing ad spend.",
      issueRecommendation: "Resolve Amazon listing issues before campaign scaling: MISSING_ATTRIBUTE.",
      sellerApprovalRequired: true
    });
  });

  it("keeps healthy existing listings in monitoring mode", () => {
    expect(analyzeAmazonExistingListing({
      sku: "AMZ-HMF-0002",
      summaries: [{ itemName: "Purple Tulip Bunny Crochet Charm for Bag, Keychain or Car", mainImage: { link: "https://example.com/main.jpg" } }],
      attributes: {
        bullet_point: [
          { value: "Adds a handmade accent to bags and keys." },
          { value: "Lightweight size is easy to carry." },
          { value: "Works as a thoughtful small gift." },
          { value: "Clear size details reduce surprise." },
          { value: "Packaged for gifting and daily use." }
        ],
        product_description: [{ value: "A detailed crochet charm for bags, backpacks, keys, and car hanging use." }]
      },
      issues: []
    })).toMatchObject({
      sku: "AMZ-HMF-0002",
      status: "monitor_listing",
      priority: "normal",
      sellerApprovalRequired: true
    });
  });
});
