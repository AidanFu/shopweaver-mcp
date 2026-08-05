import { describe, expect, it } from "vitest";
import { analyzeAmazonAplusContent, buildOptimizedAmazonAplusContentDocument } from "../src/amazon/aplus-optimization.js";

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
        "Spec/reassurance module: 3-bar vertical layout, 38 inch height, Gold finish, seller support."
      ]
    });
  });

  it("flags polished chrome finish when A+ text suggests silver, stainless, or nickel", () => {
    expect(analyzeAmazonAplusContent({
      asin: "B0CHROME",
      expectedFinish: "Polished Chrome",
      expectedHeightInches: 38,
      contentRecord: {
        contentMetadata: { name: "silver-content", status: "APPROVED" },
        contentDocument: {
          locale: "en-US",
          contentModuleList: [{
            contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
            standardProductDescription: {
              body: {
                textList: [{
                  value: "This stainless towel warmer has a brushed nickel look and silver finish."
                }]
              }
            }
          }]
        }
      }
    }).recommendations).toContain("Fix finish mismatch: A+ text mentions Stainless, but this ASIN context expects Polished Chrome.");
  });

  it("builds an optimized A+ draft document while preserving existing images", () => {
    expect(buildOptimizedAmazonAplusContentDocument({
      name: "momokids 3 vertical round",
      contentType: "EBC",
      locale: "en-US",
      contentModuleList: [
        {
          contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
          standardProductDescription: {
            body: { textList: [{ value: "Old silver 50 inches description.", decoratorSet: [] }] }
          }
        },
        {
          contentModuleType: "STANDARD_IMAGE_TEXT_OVERLAY",
          standardImageTextOverlay: {
            overlayColorType: "DARK",
            block: {
              image: { uploadDestinationId: "image-1", altText: "3v-round-1" },
              headline: { value: "", decoratorSet: [] },
              body: { textList: [{ value: "", decoratorSet: [] }] }
            }
          }
        }
      ]
    }, {
      asin: "B0GDPKVXSZ",
      finish: "Gold",
      heightInches: 38
    })).toMatchObject({
      name: "ShopWeaver optimized B0GDPKVXSZ Gold",
      contentType: "EBC",
      locale: "en-US",
      contentModuleList: [
        {
          contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
          standardProductDescription: {
            body: {
              textList: [{
                value: "Upgrade daily bathroom comfort with a wall mounted electric towel warmer rack designed to warm and dry towels while saving floor space. The 3-bar vertical design has a Gold finish and a 38 inch profile for bathrooms, laundry rooms, spa areas, and compact wall spaces. A digital timer helps manage run time, and plug-in or hardwired installation options give flexibility for different setups."
              }]
            }
          }
        },
        {
          contentModuleType: "STANDARD_IMAGE_TEXT_OVERLAY",
          standardImageTextOverlay: {
            block: {
              image: { uploadDestinationId: "image-1", altText: "Gold electric towel warmer shown in a bathroom use case" },
              headline: { value: "Warmer, drier towels after daily showers" },
              body: { textList: [{ value: "Create a more comfortable bathroom routine while helping towels dry neatly on the wall mounted 3-bar rack." }] }
            }
          }
        }
      ]
    });
  });

  it("builds an optimized A+ preview response without validation", () => {
    const optimizedDocument = buildOptimizedAmazonAplusContentDocument({
      name: "Existing A+",
      contentType: "EBC",
      locale: "en-US",
      contentModuleList: []
    }, {
      asin: "B0GDPKVXSZ",
      finish: "Gold",
      heightInches: 38
    });

    expect({
      operation: "preview_optimized_aplus_content",
      asin: "B0GDPKVXSZ",
      optimizedDocument,
      applied: false
    }).toMatchObject({
      operation: "preview_optimized_aplus_content",
      asin: "B0GDPKVXSZ",
      optimizedDocument: { name: "ShopWeaver optimized B0GDPKVXSZ Gold" },
      applied: false
    });
  });
});
