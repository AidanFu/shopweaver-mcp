import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseAmazonDailyOptimizationInputs, parseAmazonWeeklyOptimizationInputs, parseProductInformationWorkbook, refreshAmazonOptimizationRecommendations, writeAmazonListingWorkbook, writeAmazonOptimizationRecommendationsWorkbook } from "../src/import/excel.js";

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
      customerQuestionTargets: "Can I hang it in my car?",
      aiShoppingAnswerSummary: "Small handmade crochet charm for bag, keychain, or car use.",
      rufusAlexaReadinessScore: 95,
      missingBuyerFacts: "None",
      giftabilityNotes: "Useful as a small gift.",
      useCaseCoverage: "bag; backpack; keychain; car; gift",
      primaryCategoryHypothesis: "Handmade bag charm / keychain accessory",
      alternativeCategoryHypotheses: "hanging ornament; car hanging ornament",
      categoryDecisionEvidence: "Has key ring and bag charm use case.",
      similarBestsellerSearchQueries: "crochet bear bag charm; handmade keychain",
      competitorCategoryNotes: "Research best sellers before launch.",
      competitionLevel: "medium",
      adCostRisk: "medium",
      expectedConversionFit: "high",
      categoryExperimentPlan: "Start with bag charm/keychain positioning.",
      categoryLearningStatus: "hypothesis_ready",
      aiOptimizationBrief: "Review benefit-led bullets, Rufus/Alexa readiness, category evidence, and campaign learning before Amazon submission.",
      listingOptimizationRecommendation: "Confirm measured dimensions and improve benefit-led copy before launch.",
      categoryOptimizationRecommendation: "Keep handmade bag charm/keychain as the primary hypothesis until performance data says otherwise.",
      campaignOptimizationRecommendation: "Start conservative auto discovery and review search terms before bid changes.",
      analysisCadence: "daily after launch; weekly category and budget review",
      dailyAnalysisInputs: "sessions, CTR, CPC, spend, orders, conversion rate, search terms",
      weeklyAnalysisInputs: "ACOS, TACOS, category conversion, keyword winners, category experiment result",
      optimizationNextAction: "Update dimensions and review competitor category evidence.",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames).toContain("Daily Optimization Inputs");
    expect(workbook.SheetNames).toContain("Weekly Optimization Review");
    expect(workbook.SheetNames).toContain("Optimization Recommendations");
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Amazon Listings"]);
    const dailyRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Daily Optimization Inputs"]);
    const weeklyRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Weekly Optimization Review"]);
    const recommendationRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Optimization Recommendations"]);
    expect(rows[0]["Product Name"]).toBe("产品一");
    expect(rows[0]["Amazon Product Type"]).toBe("KEYCHAIN");
    expect(rows[0]["Amazon Title Length"]).toBe(59);
    expect(rows[0]["Listing Copy Quality Score"]).toBe(95);
    expect(rows[0]["Manual Review Priority"]).toBe("normal");
    expect(rows[0]["Rufus/Alexa Readiness Score"]).toBe(95);
    expect(rows[0]["Use Case Coverage"]).toBe("bag; backpack; keychain; car; gift");
    expect(rows[0]["Primary Category Hypothesis"]).toBe("Handmade bag charm / keychain accessory");
    expect(rows[0]["Category Learning Status"]).toBe("hypothesis_ready");
    expect(rows[0]["AI Optimization Brief"]).toContain("benefit-led bullets");
    expect(rows[0]["Listing Optimization Recommendation"]).toContain("benefit-led copy");
    expect(rows[0]["Category Optimization Recommendation"]).toContain("primary hypothesis");
    expect(rows[0]["Campaign Optimization Recommendation"]).toContain("auto discovery");
    expect(rows[0]["Analysis Cadence"]).toBe("daily after launch; weekly category and budget review");
    expect(rows[0]["Daily Analysis Inputs"]).toContain("CTR");
    expect(rows[0]["Weekly Analysis Inputs"]).toContain("category conversion");
    expect(rows[0]["Optimization Next Action"]).toContain("competitor category evidence");
    expect(rows[0]["Validation Status"]).toBe("needs_review");
    expect(dailyRows[0]["SKU"]).toBe("AMZ-CHAN-PIN-YI");
    expect(dailyRows[0]["CTR"]).toBe("");
    expect(dailyRows[0]["AI Daily Recommendation"]).toContain("Review only");
    expect(weeklyRows[0]["SKU"]).toBe("AMZ-CHAN-PIN-YI");
    expect(weeklyRows[0]["ACOS"]).toBe("");
    expect(weeklyRows[0]["AI Weekly Recommendation"]).toContain("Review only");
    expect(recommendationRows[0]["SKU"]).toBe("AMZ-CHAN-PIN-YI");
    expect(recommendationRows[0]["Cadence"]).toBe("daily");
    expect(recommendationRows[0]["Status"]).toBe("collect_more_data");
    expect(recommendationRows[0]["Seller Approval Required"]).toBe("yes");
  });
});

describe("parseAmazonDailyOptimizationInputs", () => {
  it("reads daily optimization metric rows from the Amazon workbook", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "SKU", "Product Name", "Sessions", "CTR", "CPC", "Spend", "Orders", "Sales", "Conversion Rate", "Search Terms", "Listing Issues"],
      ["2026-07-27", "AMZ-HMF-0001", "Purple Tulip Bunny", "120", "0.9", "0.62", "42", "0", "0", "0", "crochet bag charm", "main image weak"]
    ]), "Daily Optimization Inputs");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
    expect(parseAmazonDailyOptimizationInputs(bytes)).toEqual([{
      date: "2026-07-27",
      sku: "AMZ-HMF-0001",
      productName: "Purple Tulip Bunny",
      sessions: 120,
      ctr: 0.9,
      cpc: 0.62,
      spend: 42,
      orders: 0,
      sales: 0,
      conversionRate: 0,
      searchTerms: "crochet bag charm",
      listingIssues: "main image weak"
    }]);
  });
});

describe("parseAmazonWeeklyOptimizationInputs", () => {
  it("reads weekly optimization metric rows from the Amazon workbook", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Week Start", "SKU", "Product Name", "ACOS", "TACOS", "Total Spend", "Total Sales", "Keyword Winners", "Negative Keyword Candidates", "Category Conversion Notes"],
      ["2026-07-20", "AMZ-HMF-0001", "Purple Tulip Bunny", "72", "30", "180", "250", "", "free; pattern", "0.8% category conversion"]
    ]), "Weekly Optimization Review");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
    expect(parseAmazonWeeklyOptimizationInputs(bytes)).toEqual([{
      weekStart: "2026-07-20",
      sku: "AMZ-HMF-0001",
      productName: "Purple Tulip Bunny",
      acos: 72,
      tacos: 30,
      totalSpend: 180,
      totalSales: 250,
      keywordWinners: "",
      negativeKeywordCandidates: "free; pattern",
      categoryConversionNotes: "0.8% category conversion"
    }]);
  });
});

describe("writeAmazonOptimizationRecommendationsWorkbook", () => {
  it("writes review-only recommendations from parsed daily and weekly metrics", () => {
    const bytes = writeAmazonOptimizationRecommendationsWorkbook({
      daily: [{
        date: "2026-07-27",
        sku: "AMZ-HMF-0001",
        productName: "Purple Tulip Bunny",
        sessions: 120,
        ctr: 0.9,
        cpc: 0.62,
        spend: 42,
        orders: 0,
        sales: 0,
        conversionRate: 0,
        searchTerms: "crochet bag charm",
        listingIssues: "main image weak"
      }],
      weekly: [{
        weekStart: "2026-07-20",
        sku: "AMZ-HMF-0001",
        productName: "Purple Tulip Bunny",
        acos: 72,
        tacos: 30,
        totalSpend: 180,
        totalSales: 250,
        keywordWinners: "",
        negativeKeywordCandidates: "free; pattern",
        categoryConversionNotes: "0.8% category conversion"
      }]
    });
    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Optimization Recommendations"]);
    expect(rows[0]["Cadence"]).toBe("daily");
    expect(rows[0]["Status"]).toBe("needs_listing_review");
    expect(rows[0]["Recommendation"]).toContain("Do not increase bids");
    expect(rows[1]["Cadence"]).toBe("weekly");
    expect(rows[1]["Status"]).toBe("review_category_and_campaign");
    expect(rows[1]["Recommendation"]).toContain("category fit");
    expect(rows[1]["Seller Approval Required"]).toBe("yes");
  });
});

describe("refreshAmazonOptimizationRecommendations", () => {
  it("replaces the recommendation sheet using pasted daily and weekly metrics", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["SKU"], ["AMZ-HMF-0001"]]), "Amazon Listings");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "SKU", "Product Name", "Sessions", "CTR", "CPC", "Spend", "Orders", "Sales", "Conversion Rate", "Search Terms", "Listing Issues"],
      ["2026-07-27", "AMZ-HMF-0001", "Purple Tulip Bunny", "120", "0.9", "0.62", "42", "0", "0", "0", "crochet bag charm", "main image weak"]
    ]), "Daily Optimization Inputs");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Week Start", "SKU", "Product Name", "ACOS", "TACOS", "Total Spend", "Total Sales", "Keyword Winners", "Negative Keyword Candidates", "Category Conversion Notes"],
      ["2026-07-20", "AMZ-HMF-0001", "Purple Tulip Bunny", "72", "30", "180", "250", "", "free; pattern", "0.8% category conversion"]
    ]), "Weekly Optimization Review");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Cadence", "SKU", "Status"],
      ["daily", "old", "old_status"]
    ]), "Optimization Recommendations");
    const refreshed = refreshAmazonOptimizationRecommendations(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));
    const parsed = XLSX.read(refreshed, { type: "array" });
    const recommendationRows = XLSX.utils.sheet_to_json<Record<string, string>>(parsed.Sheets["Optimization Recommendations"]);
    expect(parsed.SheetNames).toEqual(["Amazon Listings", "Daily Optimization Inputs", "Weekly Optimization Review", "Optimization Recommendations"]);
    expect(recommendationRows).toHaveLength(2);
    expect(recommendationRows[0]["SKU"]).toBe("AMZ-HMF-0001");
    expect(recommendationRows[0]["Status"]).toBe("needs_listing_review");
    expect(recommendationRows[1]["Cadence"]).toBe("weekly");
    expect(recommendationRows[1]["Status"]).toBe("review_category_and_campaign");
  });
});
