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
      amazonProductType: "HANDMADE_HANGING_MINI_FIGURE",
      amazonCategoryPath: "Handmade Products > Accessories > Bag, Backpack, Keychain & Car Hanging Mini Figures",
      categoryConfidence: "user_confirmed",
      validationStatus: "needs_review"
    });
    expect(rows[0].amazonTitle).toContain("Crochet");
    expect(rows[0].bullet1).toContain("bag");
    expect(rows[0].mainImageNotes).toContain("01-main.jpg");
    expect(rows[0].suggestedCampaignStructure).toContain("Auto discovery campaign");
  });

  it("creates product-specific titles, bullets, descriptions, and search terms", () => {
    const rows = buildAmazonListingRows([
      {
        productName: "郁金香兔-紫色",
        rawChineseDescription: "主体为奶白色坐姿垂耳小兔，头顶紫色大蝴蝶结，怀中抱着一支钩织粉郁金香。",
        imageFolderName: "郁金香兔-紫色",
        imageCount: 7,
        images: []
      },
      {
        productName: "双马尾毕业女孩钩织挂件",
        rawChineseDescription: "双马尾毕业女孩钩织挂件，头戴黑色学士帽，适合毕业礼物。",
        imageFolderName: "双马尾毕业女孩钩织挂件",
        imageCount: 6,
        images: []
      }
    ]);
    expect(rows[0].amazonTitle).toBe("Purple Tulip Bunny Crochet Charm for Bag, Keychain or Car");
    expect(rows[1].amazonTitle).toBe("Graduation Girl with Pigtails Crochet Charm for Bag, Keychain or Car");
    expect(rows[0].amazonTitle!.length).toBeLessThanOrEqual(75);
    expect(rows[1].amazonTitle!.length).toBeLessThanOrEqual(75);
    expect(rows[0].bullet1).toContain("Purple Tulip Bunny");
    expect(rows[1].bullet1).toContain("Graduation Girl with Pigtails");
    expect(rows[0].productDescription).toContain("Purple Tulip Bunny");
    expect(rows[1].productDescription).toContain("graduation");
    expect(rows[0].backendSearchTerms).toContain("purple tulip bunny");
    expect(rows[1].backendSearchTerms).toContain("graduation girl with pigtails");
  });

  it("keeps similar Christmas tree products distinguishable", () => {
    const rows = buildAmazonListingRows([
      {
        productName: "圣诞树团子",
        rawChineseDescription: "圣诞树团子挂件",
        imageFolderName: "圣诞树团子",
        imageCount: 1,
        images: []
      },
      {
        productName: "圣诞小树团子手工钩织钥匙扣",
        rawChineseDescription: "圣诞小树团子手工钩织钥匙扣",
        imageFolderName: "圣诞小树团子手工钩织钥匙扣",
        imageCount: 1,
        images: []
      }
    ]);
    expect(rows[0].amazonTitle).not.toBe(rows[1].amazonTitle);
    expect(rows[0].amazonTitle).toContain("Christmas Tree Dumpling");
    expect(rows[1].amazonTitle).toContain("Mini Christmas Tree Dumpling");
  });

  it("adds review scoring fields for workbook quality triage", () => {
    const rows = buildAmazonListingRows([{
      productName: "郁金香兔-紫色",
      rawChineseDescription: "主体为奶白色坐姿垂耳小兔，头顶紫色大蝴蝶结，怀中抱着一支钩织粉郁金香。",
      imageFolderName: "郁金香兔-紫色",
      imageCount: 7,
      images: []
    }]);
    expect(rows[0].amazonTitleLength).toBe(rows[0].amazonTitle!.length);
    expect(rows[0].amazonTitleQualityNotes).toBe("OK");
    expect(rows[0].listingCopyQualityScore).toBe(95);
    expect(rows[0].productNameTranslationNotes).toBe("Curated English product name: Purple Tulip Bunny.");
    expect(rows[0].manualReviewPriority).toBe("normal");
  });

  it("uses English-only sequential SKUs and fills listing copy fields", () => {
    const rows = buildAmazonListingRows([
      {
        productName: "龙猫钥匙扣",
        rawChineseDescription: "手工钩织钥匙扣，适合挂包和送礼",
        imageFolderName: "龙猫钥匙扣",
        imageCount: 1,
        images: []
      },
      {
        productName: "小狗挂件",
        rawChineseDescription: "可以挂车里",
        imageFolderName: "小狗挂件",
        imageCount: 1,
        images: []
      }
    ]);
    expect(rows[0].sku).toBe("AMZ-HMF-0001");
    expect(rows[1].sku).toBe("AMZ-HMF-0002");
    expect(rows[0].sku).toMatch(/^[A-Z0-9-]+$/);
    expect(rows[0].amazonTitle).toContain("Handmade Mini Figure");
    expect(rows[0].bullet1).toContain("bag");
    expect(rows[0].bullet2).toContain("Lightweight");
    expect(rows[0].bullet3).toContain("car ornament");
    expect(rows[0].bullet4).toContain("Gift-ready");
    expect(rows[0].bullet5).toContain("handmade variations");
    expect(rows[0].productDescription).toContain("bags, backpacks, keychains, or cars");
    expect(rows[0].backendSearchTerms).toContain("car hanging ornament");
  });

  it("uses the user-confirmed hanging mini figure category for every imported product", () => {
    const rows = buildAmazonListingRows([{
      productName: "未知产品",
      rawChineseDescription: "特殊材质新产品",
      imageFolderName: null,
      imageCount: 0,
      images: []
    }]);
    expect(rows[0]).toMatchObject({
      amazonProductType: "HANDMADE_HANGING_MINI_FIGURE",
      amazonCategoryPath: "Handmade Products > Accessories > Bag, Backpack, Keychain & Car Hanging Mini Figures",
      categoryConfidence: "user_confirmed",
      validationStatus: "needs_review"
    });
    expect(rows[0].useCases).toBe("Hang on bag; hang on backpack; use as keychain; hang in car");
    expect(rows[0].validationNotes).toBe("User confirmed product family. Validate the exact Amazon product type/category before API submission.");
  });
});
