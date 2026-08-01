import { describe, expect, it } from "vitest";
import { buildEtsyVariationDraftPreview } from "../src/import/etsy-variation-draft.js";

const rows = [
  {
    productName: "郁金香兔-紫色",
    englishTitle: "Handmade Crochet Tulip Bunny",
    englishDescription: "A soft handmade crochet bunny.",
    quantity: 1,
    price: "18.99",
    taxonomyId: 2078,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 1,
    listingGroup: "郁金香兔",
    parentListingTitle: "Handmade Crochet Tulip Bunny",
    parentListingDescription: "A soft handmade crochet bunny with color options.",
    isVariant: "yes",
    variation1Name: "Color",
    variation1Value: "Purple",
    sku: "tulip-bunny-purple",
    variantPrice: "18.99",
    variantQuantity: 1,
    variantImageFolder: "郁金香兔-紫色",
    variantImageCount: 4
  },
  {
    productName: "郁金香兔-蓝色",
    englishTitle: "Handmade Crochet Tulip Bunny",
    englishDescription: "A soft handmade crochet bunny.",
    quantity: 1,
    price: "18.99",
    taxonomyId: 2078,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 1,
    listingGroup: "郁金香兔",
    parentListingTitle: "Handmade Crochet Tulip Bunny",
    parentListingDescription: "A soft handmade crochet bunny with color options.",
    isVariant: "yes",
    variation1Name: "Color",
    variation1Value: "Blue",
    sku: "tulip-bunny-blue",
    variantPrice: "18.99",
    variantQuantity: 1,
    variantImageFolder: "郁金香兔-蓝色",
    variantImageCount: 5
  }
];

describe("Etsy variation draft preview", () => {
  it("builds one draft create payload and color inventory payload for a listing group", () => {
    const preview = buildEtsyVariationDraftPreview(rows as never, "郁金香兔", { propertyId: 200 });
    expect(preview.draft.title).toBe("Handmade Crochet Tulip Bunny");
    expect(preview.draft.quantity).toBe(2);
    expect(preview.inventory.products).toHaveLength(2);
    expect(preview.inventory.products[0]).toMatchObject({
      sku: "tulip-bunny-purple",
      propertyValues: [{ propertyId: 200, propertyName: "Color", valueIds: [], values: ["Purple"] }]
    });
    expect(preview.imagePlan.variantFolders).toEqual(["郁金香兔-紫色", "郁金香兔-蓝色"]);
  });

  it("rejects rows that still need grouping review", () => {
    expect(() => buildEtsyVariationDraftPreview([{ ...rows[0], variationValidationStatus: "needs_review" }] as never, "郁金香兔", { propertyId: 200 })).toThrow("Variation rows must be reviewed");
  });
});
