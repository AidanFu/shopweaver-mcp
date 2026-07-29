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
      descriptionRecommendation: "Rewrite description with use case, dimensions, material, installation, and buyer reassurance details.",
      backendSearchRecommendation: "Expand backend search terms with relevant non-duplicative buyer phrases, synonyms, and use cases.",
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
        product_description: [{ value: "A detailed crochet charm for bags, backpacks, keys, and car hanging use." }],
        generic_keyword: [{ value: "crochet charm bag accessory handmade keychain gift backpack car hanging ornament" }]
      },
      issues: []
    })).toMatchObject({
      sku: "AMZ-HMF-0002",
      status: "monitor_listing",
      priority: "normal",
      sellerApprovalRequired: true
    });
  });

  it("flags long titles, extra bullets, and sparse backend search terms from real listing payloads", () => {
    expect(analyzeAmazonExistingListing({
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
          { value: "Extra bullet one." },
          { value: "Extra bullet two." }
        ],
        product_description: [{ value: "A vertical electric towel warmer rack for bathrooms, designed with stainless steel, a digital timer, and flexible plug-in or hardwired installation options." }],
        generic_keyword: [{ value: "Electric Heated Towel Rack" }]
      },
      issues: []
    })).toEqual({
      sku: "DH-E37S-W6DM",
      status: "needs_listing_optimization",
      priority: "normal",
      titleRecommendation: "Shorten title to improve scanability while preserving product type, installation type, material, size, and finish.",
      bulletRecommendation: "Consolidate bullets to the five strongest benefit-led points: three buyer benefits, one worry reducer, and one post-sale/support point.",
      descriptionRecommendation: "Monitor description performance against search terms, conversion rate, and customer questions.",
      backendSearchRecommendation: "Expand backend search terms with relevant non-duplicative buyer phrases, synonyms, and use cases.",
      imageRecommendation: "Monitor image performance; add scale, use-case, and detail images if conversion weakens.",
      issueRecommendation: "No active listing issues found in the fetched listing item.",
      optimizedTitle: "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      optimizedBullets: [
        "Enjoy warm, dry towels after showers while adding a polished bathroom upgrade that feels more comfortable every day.",
        "Wall mounted 3-bar design helps save floor space and keeps towels organized in bathrooms, laundry rooms, or spa areas.",
        "304-grade stainless steel construction supports daily use, while the 38 inch vertical profile fits narrow wall spaces.",
        "Digital timer and plug-in or hardwired installation options help address worries about run time, wiring, and setup flexibility.",
        "Backed by seller support; review measurements and installation needs before purchase for the best fit in your bathroom."
      ],
      optimizedDescription: "Upgrade daily bathroom comfort with a wall mounted electric towel warmer rack designed to warm and dry towels while saving floor space. The 3-bar vertical design uses 304-grade stainless steel with a polished Gold finish and a 38 inch profile for bathrooms, laundry rooms, spa areas, and compact wall spaces. A digital timer helps manage run time, and plug-in or hardwired installation options give flexibility for different setups. Review dimensions and installation requirements before purchase to confirm fit.",
      optimizedBackendSearchTerms: "heated towel rail bathroom towel dryer wall towel warmer plug in hardwired spa towel rack electric towel holder vertical towel heater",
      sellerApprovalRequired: true
    });
  });
});
