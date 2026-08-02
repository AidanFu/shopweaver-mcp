import { describe, expect, it } from "vitest";
import { buildAmazonAdsSkuAdGroupBidsPreviewPayload, buildAmazonAdsSkuApplyPlanPayload, buildAmazonAdsSkuBudgetPreviewPayload, buildAmazonAdsSkuKeywordBidsPreviewPayload, buildAmazonAdsSkuNegativeKeywordsPreviewPayload, parseAmazonAdsSkuOptimizeArgs, renderAmazonAdsSkuOptimizationSummary } from "../src/amazon-ads-sku-optimize.js";

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

  it("parses bid and keyword preview output formats", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "keyword-bids-preview"
    ])).toMatchObject({ outputFormat: "keyword-bids-preview" });
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "ad-group-bids-preview"
    ])).toMatchObject({ outputFormat: "ad-group-bids-preview" });
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "negative-keywords-preview"
    ])).toMatchObject({ outputFormat: "negative-keywords-preview" });
  });

  it("parses the combined apply plan output format", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM",
      "--format", "apply-plan"
    ])).toMatchObject({ outputFormat: "apply-plan" });
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

  it("builds the exact keyword bid preview payload from SKU optimizer output", () => {
    expect(buildAmazonAdsSkuKeywordBidsPreviewPayload("profile-1", {
      bidKeywordPreview: {
        keywordBidUpdates: [{
          keywordId: "keyword-1",
          bid: 0.6,
          reason: "Reduce wasted traffic."
        }]
      }
    })).toEqual({
      tool: "amazon_ads_update_keyword_bids",
      mode: "preview",
      profileId: "profile-1",
      keywords: [{
        keywordId: "keyword-1",
        bid: 0.6,
        reason: "Reduce wasted traffic."
      }],
      applied: false,
      warning: "Preview payload only. Submit this to amazon_ads_update_keyword_bids in preview mode, then confirm with the returned token to write."
    });
  });

  it("builds the exact ad group bid preview payload from SKU optimizer output", () => {
    expect(buildAmazonAdsSkuAdGroupBidsPreviewPayload("profile-1", {
      bidKeywordPreview: {
        adGroupBidUpdates: [{
          adGroupId: "adgroup-1",
          defaultBid: 0.45,
          reason: "Reduce wasted traffic without keyword-level bid data."
        }]
      }
    })).toEqual({
      tool: "amazon_ads_update_ad_group_bids",
      mode: "preview",
      profileId: "profile-1",
      adGroups: [{
        adGroupId: "adgroup-1",
        defaultBid: 0.45,
        reason: "Reduce wasted traffic without keyword-level bid data."
      }],
      applied: false,
      warning: "Preview payload only. Submit this to amazon_ads_update_ad_group_bids in preview mode, then confirm with the returned token to write."
    });
  });

  it("builds the exact negative keyword preview payload from SKU optimizer output", () => {
    expect(buildAmazonAdsSkuNegativeKeywordsPreviewPayload("profile-1", {
      bidKeywordPreview: {
        negativeKeywords: [{
          campaignId: "campaign-1",
          adGroupId: "adgroup-1",
          keywordText: "free crochet pattern",
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED",
          reason: "High clicks or spend with no attributed orders; review before adding as negative exact."
        }]
      }
    })).toEqual({
      tool: "amazon_ads_create_negative_keywords",
      mode: "preview",
      profileId: "profile-1",
      negativeKeywords: [{
        campaignId: "campaign-1",
        adGroupId: "adgroup-1",
        keywordText: "free crochet pattern",
        matchType: "NEGATIVE_EXACT",
        state: "ENABLED",
        reason: "High clicks or spend with no attributed orders; review before adding as negative exact."
      }],
      applied: false,
      warning: "Preview payload only. Use this as a direct negative-keyword review payload; Amazon write support still requires the gated negative-keyword confirmation flow."
    });
  });

  it("builds a combined apply plan with every gated write payload", () => {
    expect(buildAmazonAdsSkuApplyPlanPayload("profile-1", {
      status: "COMPLETED",
      reportId: "report-1",
      strategyPlan: {
        strategy: "balance_sales_growth_and_budget_efficiency",
        budgetProtection: { priority: "high" },
        salesGrowth: { priority: "normal" },
        listingConversion: { priority: "high" }
      },
      budgetReviewPreview: {
        campaignBudgetUpdates: [{
          campaignId: "campaign-1",
          budget: { budgetType: "DAILY", budget: 9 },
          reason: "Reduce waste while preserving sales budget."
        }]
      },
      campaignStateReviewPreview: {
        campaignStateUpdates: [{
          campaignId: "campaign-1",
          state: "PAUSED",
          reason: "Pause pure zero-sale waste campaign after review."
        }]
      },
      bidKeywordPreview: {
        keywordBidUpdates: [{ keywordId: "keyword-1", bid: 0.6, reason: "Reduce wasted traffic." }],
        adGroupBidUpdates: [{ adGroupId: "adgroup-1", defaultBid: 0.45, reason: "Lower weak ad group bid." }],
        negativeKeywords: [{
          campaignId: "campaign-1",
          adGroupId: "adgroup-1",
          keywordText: "free towel rack manual",
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED",
          reason: "High clicks with no attributed orders."
        }]
      }
    })).toEqual({
      operation: "preview_amazon_ads_sku_apply_plan",
      mode: "review_only",
      profileId: "profile-1",
      status: "COMPLETED",
      reportId: "report-1",
      applied: false,
      summary: {
        strategy: "balance_sales_growth_and_budget_efficiency",
        priorities: {
          budgetProtection: "high",
          salesGrowth: "normal",
          listingConversion: "high"
        },
        actionCounts: {
          campaignBudgetUpdates: 1,
          campaignStateUpdates: 1,
          keywordBidUpdates: 1,
          adGroupBidUpdates: 1,
          negativeKeywords: 1
        }
      },
      payloads: {
        campaignStates: {
          tool: "amazon_ads_update_campaign_states",
          mode: "preview",
          profileId: "profile-1",
          campaigns: [{
            campaignId: "campaign-1",
            state: "PAUSED",
            reason: "Pause pure zero-sale waste campaign after review."
          }]
        },
        campaignBudgets: {
          tool: "amazon_ads_update_campaign_budgets",
          mode: "preview",
          profileId: "profile-1",
          campaigns: [{
            campaignId: "campaign-1",
            budget: { budgetType: "DAILY", budget: 9 },
            reason: "Reduce waste while preserving sales budget."
          }]
        },
        keywordBids: {
          tool: "amazon_ads_update_keyword_bids",
          mode: "preview",
          profileId: "profile-1",
          keywords: [{ keywordId: "keyword-1", bid: 0.6, reason: "Reduce wasted traffic." }]
        },
        adGroupBids: {
          tool: "amazon_ads_update_ad_group_bids",
          mode: "preview",
          profileId: "profile-1",
          adGroups: [{ adGroupId: "adgroup-1", defaultBid: 0.45, reason: "Lower weak ad group bid." }]
        },
        negativeKeywords: {
          tool: "amazon_ads_create_negative_keywords",
          mode: "preview",
          profileId: "profile-1",
          negativeKeywords: [{
            campaignId: "campaign-1",
            adGroupId: "adgroup-1",
            keywordText: "free towel rack manual",
            matchType: "NEGATIVE_EXACT",
            state: "ENABLED",
            reason: "High clicks with no attributed orders."
          }]
        }
      },
      warning: "Review-only apply plan. Each payload still requires its own preview call and confirmation token before any Amazon Ads write."
    });
  });
});
