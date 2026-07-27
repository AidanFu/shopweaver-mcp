import { describe, expect, it } from "vitest";
import { analyzeAmazonDailyOptimization, analyzeAmazonOptimizationWorkbookInputs, analyzeAmazonWeeklyOptimization } from "../src/import/amazon-optimization.js";

describe("analyzeAmazonDailyOptimization", () => {
  it("recommends listing review when traffic clicks but does not convert", () => {
    const result = analyzeAmazonDailyOptimization({
      sessions: 120,
      ctr: 0.9,
      cpc: 0.62,
      spend: 42,
      orders: 0,
      sales: 0,
      conversionRate: 0,
      searchTerms: "crochet bag charm; handmade keychain"
    });
    expect(result.status).toBe("needs_listing_review");
    expect(result.recommendation).toContain("Do not increase bids");
    expect(result.recommendation).toContain("title, main image, price, bullets, and size facts");
  });

  it("recommends harvesting winners when terms convert efficiently", () => {
    const result = analyzeAmazonDailyOptimization({
      sessions: 80,
      ctr: 1.4,
      cpc: 0.35,
      spend: 18,
      orders: 3,
      sales: 149.97,
      conversionRate: 3.75,
      searchTerms: "crochet bag charm; cute backpack charm"
    });
    expect(result.status).toBe("harvest_winners");
    expect(result.recommendation).toContain("move converting search terms into manual exact or phrase review");
  });
});

describe("analyzeAmazonWeeklyOptimization", () => {
  it("keeps category hypothesis when conversion and ACOS are acceptable", () => {
    const result = analyzeAmazonWeeklyOptimization({
      acos: 24,
      tacos: 12,
      totalSpend: 120,
      totalSales: 500,
      categoryConversionRate: 4.2,
      keywordWinners: "crochet bag charm",
      negativeKeywordCandidates: "pattern; tutorial"
    });
    expect(result.status).toBe("keep_learning");
    expect(result.recommendation).toContain("Keep the current category hypothesis");
    expect(result.recommendation).toContain("review negative keywords");
  });

  it("recommends category and campaign review when ACOS is high and conversion is weak", () => {
    const result = analyzeAmazonWeeklyOptimization({
      acos: 72,
      tacos: 30,
      totalSpend: 180,
      totalSales: 250,
      categoryConversionRate: 0.8,
      keywordWinners: "",
      negativeKeywordCandidates: "free; pattern; tutorial"
    });
    expect(result.status).toBe("review_category_and_campaign");
    expect(result.recommendation).toContain("category fit");
    expect(result.recommendation).toContain("pause or negate wasteful terms");
  });
});

describe("analyzeAmazonOptimizationWorkbookInputs", () => {
  it("returns daily and weekly recommendations keyed by SKU", () => {
    const result = analyzeAmazonOptimizationWorkbookInputs({
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
    expect(result.daily[0]).toMatchObject({
      sku: "AMZ-HMF-0001",
      status: "needs_listing_review"
    });
    expect(result.weekly[0]).toMatchObject({
      sku: "AMZ-HMF-0001",
      status: "review_category_and_campaign"
    });
  });
});
