import { describe, expect, it } from "vitest";
import { analyzeAmazonAplusContent } from "../src/amazon/aplus-optimization.js";

describe("analyzeAmazonAplusContent", () => {
  it("flags A+ content that conflicts with the selected variation and leaves overlay modules empty", () => {
    expect(analyzeAmazonAplusContent({
      asin: "B0GDPKVXSZ",
      expectedFinish: "Gold",
      expectedHeightInches: 38,
      contentRecord: {
        contentMetadata: { name: "momokids 3 vertical round", status: "APPROVED" },
        contentDocument: {
          locale: "en-US",
          contentModuleList: [
            {
              contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
              standardProductDescription: {
                body: {
                  textList: [{
                    value: "This sleek electric heated towel rack has an elegant silver finish and stands 50 inches tall."
                  }]
                }
              }
            },
            {
              contentModuleType: "STANDARD_IMAGE_TEXT_OVERLAY",
              standardImageTextOverlay: {
                block: {
                  image: { altText: "3v-round-1" },
                  headline: { value: "" },
                  body: { textList: [{ value: "" }] }
                }
              }
            }
          ]
        }
      }
    })).toEqual({
      asin: "B0GDPKVXSZ",
      status: "needs_aplus_optimization",
      priority: "high",
      contentStatus: "APPROVED",
      moduleCount: 2,
      emptyOverlayModuleCount: 1,
      genericAltTextCount: 1,
      recommendations: [
        "Fix finish mismatch: A+ text mentions Silver, but this ASIN context expects Gold.",
        "Fix dimension mismatch: A+ text mentions 50 inches, but this ASIN context expects 38 inches.",
        "Add benefit-led headlines and body copy to image overlay modules instead of relying only on image text.",
        "Replace generic image alt text with concise product/use-case descriptions.",
        "Add A+ sections that answer installation, timer, bathroom fit, heating expectation, and post-sale reassurance concerns."
      ],
      proposedModulePlan: [
        "Hero: Electric towel warmer rack for warmer, drier towels in daily bathroom routines.",
        "Benefit strip: save floor space, organize towels, support daily drying, and upgrade bathroom finish.",
        "Installation confidence: plug-in or hardwired options, digital timer, wall-mount fit, and measurement reminder.",
        "Use-case module: bathrooms, laundry rooms, spa spaces, swimsuits, and compact walls.",
        "Spec/reassurance module: 304 stainless steel, 3-bar vertical layout, 38 inch height, Gold finish, seller support."
      ]
    });
  });
});
