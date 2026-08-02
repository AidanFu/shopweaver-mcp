import { describe, expect, it } from "vitest";
import { runAmazonAdsSkuOptimizationCycle } from "../src/amazon/ads-sku-optimization-cycle.js";

describe("runAmazonAdsSkuOptimizationCycle", () => {
  it("creates a Sponsored Products advertised-product report when no report ID is provided", async () => {
    const calls: unknown[] = [];
    const client = {
      async createSponsoredProductsAdvertisedProductReport(profileId: string, input: unknown) {
        calls.push({ profileId, input });
        return { reportId: "sku-report-1", status: "PENDING" };
      },
      async getReport() {
        throw new Error("not expected");
      },
      async downloadReportRows() {
        throw new Error("not expected");
      },
      async listSponsoredProductsCampaigns() {
        throw new Error("not expected");
      }
    };

    await expect(runAmazonAdsSkuOptimizationCycle(client, {
      profileId: "profile-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: ["80-16Z5-E38T"]
    })).resolves.toEqual({
      operation: "amazon_ads_run_sku_optimization_cycle",
      status: "PENDING",
      reportId: "sku-report-1",
      reportStartDate: "2026-07-29",
      reportEndDate: "2026-08-01",
      applied: false,
      nextStep: "Call again with this reportId after Amazon marks the advertised-product report COMPLETED."
    });
    expect(calls).toEqual([{
      profileId: "profile-1",
      input: {
        name: "ShopWeaver SP advertised products 2026-07-29 to 2026-08-01",
        startDate: "2026-07-29",
        endDate: "2026-08-01",
        timeUnit: "SUMMARY"
      }
    }]);
  });

  it("downloads a completed advertised-product report and returns SKU campaign signals", async () => {
    const client = {
      async createSponsoredProductsAdvertisedProductReport() {
        throw new Error("not expected");
      },
      async getReport() {
        return { reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" };
      },
      async downloadReportRows(url: string) {
        expect(url).toBe("https://example.test/sku-report.gz");
        return [
          { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", keywordId: "keyword-1", searchTerm: "free crochet pattern", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0, bid: 0.8 },
          { campaignId: "campaign-2", campaignName: "Exact Silver", adGroupId: "adgroup-2", advertisedSku: "5H-2EH1-7H77", keywordId: "keyword-2", searchTerm: "crochet bag charm", clicks: 20, cost: 18, purchases7d: 1, sales7d: 184.9, bid: 0.7 }
        ];
      },
      async listSponsoredProductsCampaigns(profileId: string, body: Record<string, unknown>) {
        expect(profileId).toBe("profile-1");
        expect(body).toEqual({ maxResults: 100 });
        return { campaigns: [{ campaignId: "campaign-1", budget: { budgetType: "DAILY", budget: 10 } }] };
      }
    };

    await expect(runAmazonAdsSkuOptimizationCycle(client, {
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: []
    })).resolves.toMatchObject({
      operation: "amazon_ads_run_sku_optimization_cycle",
      status: "COMPLETED",
      reportId: "sku-report-1",
      rowCount: 2,
      skuCampaignCount: 2,
      applied: false,
      analysis: {
        skuCampaigns: [
          { sku: "DH-E37S-W6DM", signal: "target_spend_no_sales" },
          { sku: "5H-2EH1-7H77", signal: "target_sold" }
        ]
      },
      actionPlan: {
        totalActionCount: 2,
        highPriorityCount: 1,
        skuCampaignActions: [
          { sku: "DH-E37S-W6DM", signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review" },
          { sku: "5H-2EH1-7H77", signal: "target_sold", priority: "normal", actionType: "monitor_target_seller_sales_vs_ad_attribution" }
        ]
      },
      controlPreview: {
        operation: "preview_amazon_ads_sku_spend_reviews",
        applied: false,
        reviewCount: 1,
        skuSpendReviews: [
          { sku: "DH-E37S-W6DM", campaignId: "campaign-1", campaignName: "Exact Gold", spend: 32, priority: "high", actionType: "reduce_spend_or_listing_review" }
        ]
      },
      campaignControlPreview: {
        operation: "preview_amazon_ads_sku_campaign_reviews",
        applied: false,
        campaignReviewCount: 1,
        campaignReviews: [
          { campaignId: "campaign-1", campaignName: "Exact Gold", totalSpend: 32, highPrioritySpend: 32, highPrioritySpendRatio: 100 }
        ]
      },
      budgetReviewPreview: {
        operation: "preview_amazon_ads_sku_campaign_budget_reviews",
        applied: false,
        budgetReviewCount: 1,
        campaignBudgetReviews: [
          { campaignId: "campaign-1", campaignName: "Exact Gold", currentBudget: { budgetType: "DAILY", budget: 10 }, suggestedBudget: { budgetType: "DAILY", budget: 5 } }
        ]
      },
      campaignStateReviewPreview: {
        operation: "preview_amazon_ads_sku_campaign_state_reviews",
        applied: false,
        stateReviewCount: 1,
        campaignStateUpdates: [
          { campaignId: "campaign-1", state: "PAUSED" }
        ]
      },
      bidKeywordPreview: {
        operation: "preview_amazon_ads_bid_keyword_recommendations",
        applied: false,
        negativeKeywordCount: 1,
        keywordBidUpdateCount: 1,
        adGroupBidUpdateCount: 0,
        winnerTermCount: 1
      },
      strategyPlan: {
        operation: "preview_amazon_ads_budget_sales_strategy",
        applied: false,
        strategy: "balance_sales_growth_and_budget_efficiency",
        budgetProtection: {
          priority: "high",
          wasteTermCount: 1,
          budgetReviewCount: 1
        },
        salesGrowth: {
          priority: "high",
          efficientTermCount: 1
        },
        listingConversion: {
          priority: "high",
          skuReviewCount: 1
        },
        cadence: "Run daily while spend is high, then weekly after ACOS and order trend stabilize."
      }
    });
  });

  it("uses normalized sales signals instead of manually split SKU sales lists", async () => {
    const client = {
      async createSponsoredProductsAdvertisedProductReport() {
        throw new Error("not expected");
      },
      async getReport() {
        return { reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" };
      },
      async downloadReportRows() {
        return [
          { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", keywordId: "keyword-1", searchTerm: "heated towel rack", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0, bid: 0.8 },
          { campaignId: "campaign-2", campaignName: "Exact Silver", adGroupId: "adgroup-2", advertisedSku: "5H-2EH1-7H77", keywordId: "keyword-2", searchTerm: "heated towel rack silver", clicks: 20, cost: 18, purchases7d: 0, sales7d: 0, bid: 0.7 }
        ];
      },
      async listSponsoredProductsCampaigns() {
        return { campaigns: [] };
      }
    };

    await expect(runAmazonAdsSkuOptimizationCycle(client, {
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"],
      targetSkusWithSales: [],
      nonTargetSkusWithSales: [],
      salesSignals: [{
        sku: "DH-E37S-W6DM",
        signal: "no_ads_or_seller_sales",
        adSpend: 32,
        sellerOrders: 0,
        adsOrders: 0
      }, {
        sku: "5H-2EH1-7H77",
        signal: "seller_order_without_ads_attribution",
        adSpend: 18,
        sellerOrders: 1,
        adsOrders: 0
      }]
    })).resolves.toMatchObject({
      analysis: {
        skuCampaigns: [
          { sku: "DH-E37S-W6DM", signal: "target_spend_no_sales" },
          { sku: "5H-2EH1-7H77", signal: "target_sold" }
        ]
      },
      strategyPlan: {
        salesGrowth: {
          recommendedActions: ["Keep 1 SKU(s) with recent sales active, but scale only after Ads attribution and seller orders agree."]
        }
      }
    });
  });
});
