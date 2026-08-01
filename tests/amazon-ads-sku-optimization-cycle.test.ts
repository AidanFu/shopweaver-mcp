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
          { campaignId: "campaign-1", campaignName: "Exact Gold", advertisedSku: "DH-E37S-W6DM", cost: 32, purchases7d: 0, sales7d: 0 },
          { campaignId: "campaign-2", campaignName: "Exact Silver", advertisedSku: "5H-2EH1-7H77", cost: 18, purchases7d: 1, sales7d: 184.9 }
        ];
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
      }
    });
  });
});
