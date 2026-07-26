import { describe, expect, it } from "vitest";
import { buildAmazonListingRows } from "../src/import/amazon-listing.js";

describe("buildAmazonListingRows", () => {
  it("builds Amazon planning rows from imported Drive products", () => {
    const rows = buildAmazonListingRows([{
      productName: "龙猫钥匙扣",
      rawChineseDescription: "手工钩织钥匙扣，适合挂包和送礼",
      imageFolderName: "龙猫钥匙扣",
      imageCount: 3,
      images: [
        { id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" },
        { id: "img2", name: "02-bag.jpg", mimeType: "image/jpeg" }
      ]
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productName: "龙猫钥匙扣",
      imageFolder: "龙猫钥匙扣",
      imageCount: 3,
      amazonProductType: "KEYCHAIN",
      categoryConfidence: "medium",
      validationStatus: "needs_review"
    });
    expect(rows[0].amazonTitle).toContain("Crochet");
    expect(rows[0].bullet1).toContain("bag");
    expect(rows[0].mainImageNotes).toContain("01-main.jpg");
    expect(rows[0].suggestedCampaignStructure).toContain("Auto discovery campaign");
  });

  it("keeps uncertain categories review-gated instead of guessing silently", () => {
    const rows = buildAmazonListingRows([{
      productName: "未知产品",
      rawChineseDescription: "特殊材质新产品",
      imageFolderName: null,
      imageCount: 0,
      images: []
    }]);
    expect(rows[0]).toMatchObject({
      amazonProductType: "",
      amazonCategoryPath: "",
      categoryConfidence: "low",
      validationStatus: "needs_review"
    });
    expect(rows[0].validationNotes).toBe("Review Amazon category/product type before submission.");
  });
});
