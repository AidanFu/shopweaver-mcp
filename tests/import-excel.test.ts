import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProductInformationWorkbook, writeAmazonListingWorkbook } from "../src/import/excel.js";

function workbookBytes(rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("parseProductInformationWorkbook", () => {
  it("groups column C descriptions under the nearest column A product", () => {
    const bytes = workbookBytes([
      ["产品一", "", "第一行描述"],
      ["", "", "第二行描述"],
      ["", "", ""],
      ["产品二", "", "另一个描述"],
      ["", "", "更多描述"]
    ]);
    expect(parseProductInformationWorkbook(bytes)).toEqual([
      { productName: "产品一", rawChineseDescription: "第一行描述\n第二行描述", rowStart: 1, rowEnd: 2 },
      { productName: "产品二", rawChineseDescription: "另一个描述\n更多描述", rowStart: 4, rowEnd: 5 }
    ]);
  });
});

describe("writeAmazonListingWorkbook", () => {
  it("writes Amazon listing planning columns and rows", () => {
    const bytes = writeAmazonListingWorkbook([{
      productName: "产品一",
      sourceChineseDescription: "手工钩织钥匙扣",
      imageFolder: "产品一",
      imageCount: 2,
      amazonProductType: "KEYCHAIN",
      amazonCategoryPath: "Clothing, Shoes & Jewelry > Luggage & Travel Gear > Keychains",
      categoryConfidence: "medium",
      sku: "AMZ-CHAN-PIN-YI",
      parentSku: "",
      variationTheme: "",
      color: "",
      size: "",
      amazonTitle: "Crochet Bag Charm Keychain, Handmade Mini Gift Accessory",
      bullet1: "Handmade crochet charm for bags, keys, backpacks, and gift baskets.",
      bullet2: "Lightweight design makes it easy to carry without adding bulk.",
      bullet3: "Soft textured yarn adds a warm handmade look to everyday accessories.",
      bullet4: "Gift-ready option for birthdays, holidays, party favors, and desk decor.",
      bullet5: "Each piece may have small handmade variations in shape and detail.",
      productDescription: "A compact crochet charm designed for bags, keys, backpacks, and small gifts.",
      backendSearchTerms: "crochet charm bag accessory handmade gift key ring",
      targetCustomer: "Gift buyers and accessory shoppers",
      useCases: "Bag charm; keychain; stocking stuffer",
      mainImageNotes: "Use the clearest product-only image as the main image candidate.",
      lifestyleImageNotes: "Show attached to a bag, backpack, or key ring.",
      infographicImageNotes: "Call out handmade texture, gift use, and lightweight size.",
      sizeImageNotes: "Add a size reference image before Amazon submission.",
      aplusModule1Headline: "Small Handmade Accent",
      aplusModule1Body: "Adds soft crochet texture to everyday carry items.",
      aplusModule2Headline: "Giftable Everyday Charm",
      aplusModule2Body: "Useful for birthdays, holidays, favors, and small thank-you gifts.",
      aplusModule3Headline: "Designed For Flexible Use",
      aplusModule3Body: "Works on keys, bags, backpacks, shelves, and desk displays.",
      adKeywordSeeds: "crochet keychain, handmade bag charm, cute keychain gift",
      negativeKeywordSeeds: "digital, pattern, wholesale",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign; Manual phrase campaign",
      suggestedPrice: "",
      packageWeight: "",
      packageDimensions: "",
      inventory: "",
      complianceNotes: "Review Amazon product type, choking hazard, and age grading before submission.",
      amazonTitleLength: 59,
      amazonTitleQualityNotes: "OK",
      listingCopyQualityScore: 95,
      productNameTranslationNotes: "Curated English product name: Crochet Bag Charm.",
      manualReviewPriority: "normal",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Amazon Listings"]);
    expect(rows[0]["Product Name"]).toBe("产品一");
    expect(rows[0]["Amazon Product Type"]).toBe("KEYCHAIN");
    expect(rows[0]["Amazon Title Length"]).toBe(59);
    expect(rows[0]["Listing Copy Quality Score"]).toBe(95);
    expect(rows[0]["Manual Review Priority"]).toBe("normal");
    expect(rows[0]["Validation Status"]).toBe("needs_review");
  });
});
