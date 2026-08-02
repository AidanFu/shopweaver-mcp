import { describe, expect, it } from "vitest";
import { buildAmazonAdsSkuBudgetPreviewPayload, parseAmazonAdsSkuOptimizeArgs, renderAmazonAdsSkuOptimizationSummary } from "../src/amazon-ads-sku-optimize.js";

describe("parseAmazonAdsSkuOptimizeArgs", () => {
  it("parses SKU campaign optimization cycle arguments", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM,77-UM99-B96T,5H-2EH1-7H77",
      "--target-skus-with-sales", "5H-2EH1-7H77",
      "--non-target-skus-with-sales", "80-16Z5-E38T",
      "--report-id", "sku-report-1"
    ])).toEqual({
      profileId: "749555662454438",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: ["80-16Z5-E38T"],
      reportId: "sku-report-1",
      outputFormat: "json"
    });
  });

  it("parses summary output format", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "summary"
    ])).toMatchObject({ outputFormat: "summary" });
  });

  it("parses budget preview output format", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "budget-preview"
    ])).toMatchObject({ outputFormat: "budget-preview" });
  });

  it("renders a compact SKU optimization summary for daily campaign decisions", () => {
    expect(renderAmazonAdsSkuOptimizationSummary({
      operation: "amazon_ads_run_sku_optimization_cycle",
      status: "COMPLETED",
      reportId: "sku-report-1",
      rowCount: 67,
      skuCampaignCount: 24,
      strategyPlan: {
        operation: "preview_amazon_ads_budget_sales_strategy",
        applied: false,
        strategy: "balance_sales_growth_and_budget_efficiency",
        budgetProtection: {
          priority: "high",
          wasteTermCount: 0,
          budgetReviewCount: 1,
          recommendedActions: ["Review 1 campaign budget reduction payload(s) as spend reallocation candidates, not pure sales-limiting cuts."]
        },
        salesGrowth: {
          priority: "high",
          efficientTermCount: 1,
          recommendedActions: ["Keep 1 SKU(s) with recent sales active, but scale only after Ads attribution and seller orders agree."]
        },
        listingConversion: {
          priority: "high",
          skuReviewCount: 2,
          recommendedActions: ["Review listing conversion for 2 advertised SKU(s) with spend but no recent SKU-level sales before raising bids or budgets."]
        },
        cadence: "Run daily while spend is high, then weekly after ACOS and order trend stabilize."
      },
      budgetReviewPreview: {
        budgetReviewCount: 1,
        campaignBudgetUpdates: [{
          campaignId: "72675144208564",
          budget: { budgetType: "DAILY", budget: 9 },
          reason: "Reduce daily budget from 18 to 9 only after reviewing SKU fit and ad group bids; 83.73% of spend is high-priority zero-sale SKU spend."
        }]
      },
      bidKeywordPreview: {
        negativeKeywordCount: 1,
        keywordBidUpdateCount: 1,
        adGroupBidUpdateCount: 0,
        winnerTermCount: 1,
        negativeKeywords: [
          { campaignId: "72675144208564", adGroupId: "153245", keywordText: "free towel warmer manual" }
        ],
        keywordBidUpdates: [
          { keywordId: "987654", bid: 0.6, reason: "Reduce bid from 0.8 to 0.6 for wasted traffic before increasing campaign budget." }
        ],
        winnerTerms: [
          { campaignName: "Exact | Reviewed SKUs Focus", searchTerm: "heated towel rack wall mounted", acos: 22.4, recommendation: "Protect this converting term." }
        ]
      },
      controlPreview: {
        reviewCount: 2,
        skuSpendReviews: [
          { sku: "DH-E37S-W6DM", campaignName: "Exact | Reviewed SKUs Focus", spend: 22.37, recommendedNextStep: "Review listing conversion." },
          { sku: "77-UM99-B96T", campaignName: "Exact | Reviewed SKUs Focus", spend: 14.08, recommendedNextStep: "Review listing conversion." }
        ]
      },
      applied: false
    })).toBe([
      "Amazon Ads SKU Optimization Summary",
      "Status: COMPLETED | Report: sku-report-1 | Rows: 67 | SKUs: 24 | Applied: false",
      "Strategy: balance_sales_growth_and_budget_efficiency",
      "Budget efficiency: high | waste terms: 0 | budget reviews: 1",
      "- Review 1 campaign budget reduction payload(s) as spend reallocation candidates, not pure sales-limiting cuts.",
      "Sales growth: high | efficient terms: 1",
      "- Keep 1 SKU(s) with recent sales active, but scale only after Ads attribution and seller orders agree.",
      "Listing conversion: high | SKU reviews: 2",
      "- Review listing conversion for 2 advertised SKU(s) with spend but no recent SKU-level sales before raising bids or budgets.",
      "Budget payloads:",
      "- campaign 72675144208564 -> DAILY 9: Reduce daily budget from 18 to 9 only after reviewing SKU fit and ad group bids; 83.73% of spend is high-priority zero-sale SKU spend.",
      "Bid and keyword previews:",
      "- negatives: 1 | keyword bid reductions: 1 | ad group bid reductions: 0 | winner terms: 1",
      "- negative 72675144208564/153245: free towel warmer manual",
      "- keyword 987654 -> bid 0.6: Reduce bid from 0.8 to 0.6 for wasted traffic before increasing campaign budget.",
      "- winner Exact | Reviewed SKUs Focus: heated towel rack wall mounted | ACOS 22.4 | Protect this converting term.",
      "SKU reviews:",
      "- DH-E37S-W6DM | Exact | Reviewed SKUs Focus | spend 22.37 | Review listing conversion.",
      "- 77-UM99-B96T | Exact | Reviewed SKUs Focus | spend 14.08 | Review listing conversion.",
      "Cadence: Run daily while spend is high, then weekly after ACOS and order trend stabilize."
    ].join("\n"));
  });

  it("builds the exact existing budget update preview payload from SKU optimizer output", () => {
    expect(buildAmazonAdsSkuBudgetPreviewPayload("profile-1", {
      budgetReviewPreview: {
        campaignBudgetUpdates: [{
          campaignId: "72675144208564",
          budget: { budgetType: "DAILY", budget: 9 },
          reason: "Reallocate spend from weak traffic."
        }]
      }
    })).toEqual({
      tool: "amazon_ads_update_campaign_budgets",
      mode: "preview",
      profileId: "profile-1",
      campaigns: [{
        campaignId: "72675144208564",
        budget: { budgetType: "DAILY", budget: 9 },
        reason: "Reallocate spend from weak traffic."
      }],
      applied: false,
      warning: "Preview payload only. Submit this to amazon_ads_update_campaign_budgets in preview mode, then confirm with the returned token to write."
    });
  });
});
