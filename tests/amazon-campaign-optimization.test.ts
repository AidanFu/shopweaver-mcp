import { describe, expect, it } from "vitest";
import { analyzeAmazonCampaignMetrics, analyzeAmazonCampaignSkuSignals, analyzeAmazonSearchTermReportRows, buildAmazonCampaignBudgetSalesPlan, buildAmazonCampaignSkuActionPlan, buildAmazonCampaignSkuBudgetReviewPreview, buildAmazonCampaignSkuCampaignControlPreview, buildAmazonCampaignSkuControlPreview } from "../src/amazon/campaign-optimization.js";

describe("analyzeAmazonCampaignMetrics", () => {
  it("flags spend with clicks but no orders for budget review", () => {
    expect(analyzeAmazonCampaignMetrics({
      campaignId: "campaign-1",
      campaignName: "Auto Discovery",
      spend: 75,
      sales: 0,
      clicks: 120,
      orders: 0,
      acos: 0,
      searchTerms: "crochet keychain; free crochet pattern"
    })).toEqual({
      campaignId: "campaign-1",
      campaignName: "Auto Discovery",
      status: "reduce_waste",
      priority: "high",
      actionType: "budget_watch",
      recommendation: "Reduce or cap budget until waste terms and listing conversion are reviewed; this campaign has high spend and clicks with no orders.",
      sellerApprovalRequired: true
    });
  });

  it("recommends scaling efficient campaigns conservatively", () => {
    expect(analyzeAmazonCampaignMetrics({
      campaignId: "campaign-2",
      campaignName: "Manual Exact Winners",
      spend: 40,
      sales: 180,
      clicks: 50,
      orders: 6,
      acos: 22,
      searchTerms: "crochet bag charm"
    })).toMatchObject({
      status: "scale_carefully",
      priority: "normal",
      actionType: "budget_bid_review"
    });
  });

  it("turns Sponsored Products search-term report rows into campaign recommendations", () => {
    expect(analyzeAmazonSearchTermReportRows([
      { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", matchType: "BROAD", targeting: "crochet keychain", searchTerm: "free crochet pattern", clicks: 80, cost: 48, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", matchType: "PHRASE", targeting: "crochet charm", searchTerm: "crochet keychain", clicks: 45, cost: 30, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupId: "adgroup-2", adGroupName: "Exact Winners", matchType: "EXACT", targeting: "crochet bag charm", searchTerm: "crochet bag charm", clicks: 50, cost: 40, sales7d: 180, purchases7d: 6 }
    ])).toEqual({
      rowCount: 3,
      campaignCount: 2,
      totalSpend: 118,
      totalSales: 180,
      blendedAcos: 65.56,
      wasteSearchTerms: [
        { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", matchType: "BROAD", targeting: "crochet keychain", searchTerm: "free crochet pattern", clicks: 80, spend: 48, sales: 0, orders: 0, recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders." },
        { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", matchType: "PHRASE", targeting: "crochet charm", searchTerm: "crochet keychain", clicks: 45, spend: 30, sales: 0, orders: 0, recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders." }
      ],
      efficientSearchTerms: [
        { campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupId: "adgroup-2", adGroupName: "Exact Winners", matchType: "EXACT", targeting: "crochet bag charm", searchTerm: "crochet bag charm", clicks: 50, spend: 40, sales: 180, orders: 6, acos: 22.22, recommendation: "Keep active; consider moving to exact match or modest bid increase only after budget waste is reduced." }
      ],
      recommendations: [{
        campaignId: "campaign-1",
        campaignName: "Auto Discovery",
        status: "reduce_waste",
        priority: "high",
        actionType: "budget_watch",
        recommendation: "Reduce or cap budget until waste terms and listing conversion are reviewed; this campaign has high spend and clicks with no orders.",
        sellerApprovalRequired: true
      }, {
        campaignId: "campaign-2",
        campaignName: "Manual Exact Winners",
        status: "scale_carefully",
        priority: "normal",
        actionType: "budget_bid_review",
        recommendation: "Review controlled budget or bid increases for efficient terms; keep changes seller-approved and monitor ACOS after each adjustment.",
        sellerApprovalRequired: true
      }]
    });
  });

  it("normalizes exported report column names for waste-term review", () => {
    expect(analyzeAmazonSearchTermReportRows([
      { "Campaign Name": "Auto Discovery", "Campaign ID": "campaign-1", "Customer Search Term": "free towel warmer manual", Clicks: "18", Spend: "$16.25", "7 Day Total Sales": "$0.00", "7 Day Total Orders (#)": "0" }
    ])).toMatchObject({
      totalSpend: 16.25,
      wasteSearchTerms: [{
        campaignId: "campaign-1",
        campaignName: "Auto Discovery",
        searchTerm: "free towel warmer manual",
        clicks: 18,
        spend: 16.25,
        sales: 0,
        orders: 0
      }]
    });
  });

  it("connects campaign spend to SKU sales signals for listing and budget review", () => {
    expect(analyzeAmazonCampaignSkuSignals([
      { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", cost: 20, purchases7d: 0, sales7d: 0 },
      { campaignId: "campaign-4", campaignName: "Broad Gold", adGroupId: "adgroup-4", advertisedSku: "DH-E37S-W6DM", cost: 12, purchases7d: 0, sales7d: 0 },
      { campaignId: "campaign-2", campaignName: "Exact Silver", advertisedSku: "5H-2EH1-7H77", cost: 18, purchases7d: 1, sales7d: 184.9 },
      { campaignId: "campaign-3", campaignName: "Hardware Kit", advertisedSku: "80-16Z5-E38T", cost: 4, purchases7d: 1, sales7d: 15 }
    ], {
      targetSkus: ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      targetSkusWithoutSales: ["DH-E37S-W6DM", "77-UM99-B96T"],
      nonTargetSkusWithSales: ["80-16Z5-E38T"]
    })).toEqual({
      skuCampaigns: [
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1", "campaign-4"], campaignNames: ["Exact Gold", "Broad Gold"], spend: 32, sales: 0, orders: 0, signal: "target_spend_no_sales", recommendation: "Reduce spend pressure or review listing conversion for DH-E37S-W6DM; this target SKU has ad spend but no recent SKU-level sales.", campaignBreakdowns: [
          { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 20, sales: 0, orders: 0 },
          { campaignId: "campaign-4", campaignName: "Broad Gold", adGroupIds: ["adgroup-4"], spend: 12, sales: 0, orders: 0 }
        ] },
        { sku: "5H-2EH1-7H77", campaignIds: ["campaign-2"], campaignNames: ["Exact Silver"], spend: 18, sales: 184.9, orders: 1, signal: "target_sold", recommendation: "Keep 5H-2EH1-7H77 active and monitor ACOS; this target SKU has recent sales.", campaignBreakdowns: [
          { campaignId: "campaign-2", campaignName: "Exact Silver", adGroupIds: [], spend: 18, sales: 184.9, orders: 1 }
        ] },
        { sku: "80-16Z5-E38T", campaignIds: ["campaign-3"], campaignNames: ["Hardware Kit"], spend: 4, sales: 15, orders: 1, signal: "non_target_sold", recommendation: "Review 80-16Z5-E38T separately; non-target demand is present and should not be mixed with optimized listing campaign conclusions.", campaignBreakdowns: [
          { campaignId: "campaign-3", campaignName: "Hardware Kit", adGroupIds: [], spend: 4, sales: 15, orders: 1 }
        ] }
      ]
    });
  });

  it("prioritizes SKU campaign action items by waste and target listing pressure", () => {
    expect(buildAmazonCampaignSkuActionPlan({
      skuCampaigns: [
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 26.18, sales: 0, orders: 0 }], spend: 26.18, sales: 0, orders: 0, signal: "target_spend_no_sales", recommendation: "Reduce spend pressure or review listing conversion for DH-E37S-W6DM; this target SKU has ad spend but no recent SKU-level sales." },
        { sku: "77-UM99-B96T", campaignIds: ["campaign-2"], campaignNames: ["Exact Silver"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Exact Silver", adGroupIds: ["adgroup-2"], spend: 19.45, sales: 0, orders: 0 }], spend: 19.45, sales: 0, orders: 0, signal: "target_spend_no_sales", recommendation: "Reduce spend pressure or review listing conversion for 77-UM99-B96T; this target SKU has ad spend but no recent SKU-level sales." },
        { sku: "FQ-6KKW-ESSD", campaignIds: ["campaign-3"], campaignNames: ["Broad Discovery"], campaignBreakdowns: [{ campaignId: "campaign-3", campaignName: "Broad Discovery", adGroupIds: ["adgroup-3"], spend: 53.21, sales: 0, orders: 0 }], spend: 53.21, sales: 0, orders: 0, signal: "collect_more_data", recommendation: "Collect more ad and order data for FQ-6KKW-ESSD before changing campaign structure." },
        { sku: "5H-2EH1-7H77", campaignIds: ["campaign-4"], campaignNames: ["Power"], campaignBreakdowns: [{ campaignId: "campaign-4", campaignName: "Power", adGroupIds: ["adgroup-4"], spend: 8.12, sales: 0, orders: 0 }], spend: 8.12, sales: 0, orders: 0, signal: "target_sold", recommendation: "Keep 5H-2EH1-7H77 active and monitor ACOS; this target SKU has recent sales." }
      ]
    })).toEqual({
      totalActionCount: 4,
      highPriorityCount: 3,
      targetSpendNoSalesCount: 2,
      highSpendNoSalesCount: 1,
      skuCampaignActions: [
        { sku: "FQ-6KKW-ESSD", campaignIds: ["campaign-3"], campaignNames: ["Broad Discovery"], campaignBreakdowns: [{ campaignId: "campaign-3", campaignName: "Broad Discovery", adGroupIds: ["adgroup-3"], spend: 53.21, sales: 0, orders: 0 }], spend: 53.21, sales: 0, orders: 0, signal: "collect_more_data", priority: "high", actionType: "non_target_waste_review", recommendation: "Review FQ-6KKW-ESSD because non-target spend is high with no recent attributed orders.", sellerApprovalRequired: true },
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 26.18, sales: 0, orders: 0 }], spend: 26.18, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendation: "Reduce spend pressure or review listing conversion for DH-E37S-W6DM; this target SKU has ad spend but no recent SKU-level sales.", sellerApprovalRequired: true },
        { sku: "77-UM99-B96T", campaignIds: ["campaign-2"], campaignNames: ["Exact Silver"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Exact Silver", adGroupIds: ["adgroup-2"], spend: 19.45, sales: 0, orders: 0 }], spend: 19.45, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendation: "Reduce spend pressure or review listing conversion for 77-UM99-B96T; this target SKU has ad spend but no recent SKU-level sales.", sellerApprovalRequired: true },
        { sku: "5H-2EH1-7H77", campaignIds: ["campaign-4"], campaignNames: ["Power"], campaignBreakdowns: [{ campaignId: "campaign-4", campaignName: "Power", adGroupIds: ["adgroup-4"], spend: 8.12, sales: 0, orders: 0 }], spend: 8.12, sales: 0, orders: 0, signal: "target_sold", priority: "normal", actionType: "monitor_target_seller_sales_vs_ad_attribution", recommendation: "Keep 5H-2EH1-7H77 active, but do not scale blindly until seller-order sales and Ads attribution agree.", sellerApprovalRequired: true }
      ]
    });
  });

  it("previews SKU-level spend reviews without creating campaign changes", () => {
    expect(buildAmazonCampaignSkuControlPreview({
      totalActionCount: 3,
      highPriorityCount: 2,
      targetSpendNoSalesCount: 1,
      highSpendNoSalesCount: 1,
      skuCampaignActions: [
        { sku: "FQ-6KKW-ESSD", campaignIds: ["campaign-3"], campaignNames: ["Broad Discovery"], campaignBreakdowns: [{ campaignId: "campaign-3", campaignName: "Broad Discovery", adGroupIds: ["adgroup-3"], spend: 53.21, sales: 0, orders: 0 }], spend: 53.21, sales: 0, orders: 0, signal: "collect_more_data", priority: "high", actionType: "non_target_waste_review", recommendation: "Review FQ-6KKW-ESSD because non-target spend is high with no recent attributed orders.", sellerApprovalRequired: true },
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1", "campaign-4"], campaignNames: ["Exact Gold", "Broad Gold"], campaignBreakdowns: [
          { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 20, sales: 0, orders: 0 },
          { campaignId: "campaign-4", campaignName: "Broad Gold", adGroupIds: ["adgroup-4"], spend: 12, sales: 0, orders: 0 }
        ], spend: 32, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendation: "Reduce spend pressure or review listing conversion for DH-E37S-W6DM; this target SKU has ad spend but no recent SKU-level sales.", sellerApprovalRequired: true },
        { sku: "5H-2EH1-7H77", campaignIds: ["campaign-2"], campaignNames: ["Exact Silver"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Exact Silver", adGroupIds: ["adgroup-2"], spend: 8, sales: 0, orders: 0 }], spend: 8, sales: 0, orders: 0, signal: "target_sold", priority: "normal", actionType: "monitor_target_seller_sales_vs_ad_attribution", recommendation: "Keep 5H-2EH1-7H77 active, but do not scale blindly until seller-order sales and Ads attribution agree.", sellerApprovalRequired: true }
      ]
    })).toEqual({
      operation: "preview_amazon_ads_sku_spend_reviews",
      applied: false,
      warning: "Preview only. No campaigns, ad groups, bids, budgets, keywords, negatives, product ads, or listings were changed.",
      reviewCount: 3,
      skuSpendReviews: [
        { sku: "FQ-6KKW-ESSD", campaignId: "campaign-3", campaignName: "Broad Discovery", adGroupIds: ["adgroup-3"], spend: 53.21, sales: 0, orders: 0, signal: "collect_more_data", priority: "high", actionType: "non_target_waste_review", recommendedNextStep: "Review SKU, campaign fit, and ad group targeting before reducing spend; this non-target SKU has high spend with no attributed orders.", sellerApprovalRequired: true },
        { sku: "DH-E37S-W6DM", campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 20, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendedNextStep: "Review listing conversion, product ad state, ad group bid, and campaign budget pressure before applying any spend reduction.", sellerApprovalRequired: true },
        { sku: "DH-E37S-W6DM", campaignId: "campaign-4", campaignName: "Broad Gold", adGroupIds: ["adgroup-4"], spend: 12, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendedNextStep: "Review listing conversion, product ad state, ad group bid, and campaign budget pressure before applying any spend reduction.", sellerApprovalRequired: true }
      ]
    });
  });

  it("previews campaign-level reviews when high-priority SKU spend dominates zero-sale campaign spend", () => {
    const analysis = {
      skuCampaigns: [
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 30, sales: 0, orders: 0 }], spend: 30, sales: 0, orders: 0, signal: "target_spend_no_sales" as const, recommendation: "Review target SKU." },
        { sku: "FQ-6KKW-ESSD", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 20, sales: 0, orders: 0 }], spend: 20, sales: 0, orders: 0, signal: "collect_more_data" as const, recommendation: "Review non-target SKU." },
        { sku: "LOW-SPEND", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 10, sales: 0, orders: 0 }], spend: 10, sales: 0, orders: 0, signal: "collect_more_data" as const, recommendation: "Collect more data." },
        { sku: "WINNER", campaignIds: ["campaign-2"], campaignNames: ["Exact Winner"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Exact Winner", adGroupIds: ["adgroup-2"], spend: 40, sales: 180, orders: 2 }], spend: 40, sales: 180, orders: 2, signal: "target_sold" as const, recommendation: "Monitor winner." }
      ]
    };
    const actionPlan = {
      totalActionCount: 4,
      highPriorityCount: 2,
      targetSpendNoSalesCount: 1,
      highSpendNoSalesCount: 1,
      skuCampaignActions: [
        { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 30, sales: 0, orders: 0 }], spend: 30, sales: 0, orders: 0, signal: "target_spend_no_sales" as const, priority: "high" as const, actionType: "reduce_spend_or_listing_review" as const, recommendation: "Review target SKU.", sellerApprovalRequired: true as const },
        { sku: "FQ-6KKW-ESSD", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 20, sales: 0, orders: 0 }], spend: 20, sales: 0, orders: 0, signal: "collect_more_data" as const, priority: "high" as const, actionType: "non_target_waste_review" as const, recommendation: "Review non-target SKU.", sellerApprovalRequired: true as const },
        { sku: "LOW-SPEND", campaignIds: ["campaign-1"], campaignNames: ["Exact Gold"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Exact Gold", adGroupIds: ["adgroup-1"], spend: 10, sales: 0, orders: 0 }], spend: 10, sales: 0, orders: 0, signal: "collect_more_data" as const, priority: "normal" as const, actionType: "separate_or_protect_non_target_demand" as const, recommendation: "Collect more data.", sellerApprovalRequired: true as const },
        { sku: "WINNER", campaignIds: ["campaign-2"], campaignNames: ["Exact Winner"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Exact Winner", adGroupIds: ["adgroup-2"], spend: 40, sales: 180, orders: 2 }], spend: 40, sales: 180, orders: 2, signal: "target_sold" as const, priority: "normal" as const, actionType: "monitor_target_seller_sales_vs_ad_attribution" as const, recommendation: "Monitor winner.", sellerApprovalRequired: true as const }
      ]
    };

    expect(buildAmazonCampaignSkuCampaignControlPreview(analysis, actionPlan)).toEqual({
      operation: "preview_amazon_ads_sku_campaign_reviews",
      applied: false,
      warning: "Preview only. No campaign budgets, campaign states, bidding strategies, ad groups, bids, keywords, negatives, product ads, or listings were changed.",
      campaignReviewCount: 1,
      campaignReviews: [{
        campaignId: "campaign-1",
        campaignName: "Exact Gold",
        totalSpend: 60,
        highPrioritySpend: 50,
        highPrioritySpendRatio: 83.33,
        sales: 0,
        orders: 0,
        affectedSkus: ["DH-E37S-W6DM", "FQ-6KKW-ESSD"],
        recommendedNextStep: "Review campaign budget, ad group bids, and SKU fit before applying any spend reduction; high-priority zero-sale SKU spend dominates this campaign.",
        sellerApprovalRequired: true
      }]
    });
  });

  it("previews budget review candidates from campaign concentration and current budgets", () => {
    expect(buildAmazonCampaignSkuBudgetReviewPreview({
      operation: "preview_amazon_ads_sku_campaign_reviews",
      applied: false,
      warning: "Preview only. No campaign budgets, campaign states, bidding strategies, ad groups, bids, keywords, negatives, product ads, or listings were changed.",
      campaignReviewCount: 2,
      campaignReviews: [{
        campaignId: "campaign-1",
        campaignName: "Exact Gold",
        totalSpend: 60,
        highPrioritySpend: 50,
        highPrioritySpendRatio: 83.33,
        sales: 0,
        orders: 0,
        affectedSkus: ["DH-E37S-W6DM", "FQ-6KKW-ESSD"],
        recommendedNextStep: "Review campaign budget, ad group bids, and SKU fit before applying any spend reduction; high-priority zero-sale SKU spend dominates this campaign.",
        sellerApprovalRequired: true
      }, {
        campaignId: "campaign-2",
        campaignName: "Exact Minimum",
        totalSpend: 40,
        highPrioritySpend: 40,
        highPrioritySpendRatio: 100,
        sales: 0,
        orders: 0,
        affectedSkus: ["LOW-BUDGET"],
        recommendedNextStep: "Review campaign budget, ad group bids, and SKU fit before applying any spend reduction; high-priority zero-sale SKU spend dominates this campaign.",
        sellerApprovalRequired: true
      }]
    }, [
      { campaignId: "campaign-1", budget: { budgetType: "DAILY", budget: 12 } },
      { campaignId: "campaign-2", budget: { budgetType: "DAILY", budget: 3 } }
    ])).toEqual({
      operation: "preview_amazon_ads_sku_campaign_budget_reviews",
      applied: false,
      warning: "Preview only. No campaign budgets were changed. Confirm through the existing campaign budget update flow before applying any exact payload.",
      budgetReviewCount: 1,
      campaignBudgetReviews: [{
        campaignId: "campaign-1",
        campaignName: "Exact Gold",
        currentBudget: { budgetType: "DAILY", budget: 12 },
        suggestedBudget: { budgetType: "DAILY", budget: 6 },
        reason: "Reduce daily budget from 12 to 6 only after reviewing SKU fit and ad group bids; 83.33% of spend is high-priority zero-sale SKU spend.",
        affectedSkus: ["DH-E37S-W6DM", "FQ-6KKW-ESSD"],
        sellerApprovalRequired: true
      }],
      campaignBudgetUpdates: [{
        campaignId: "campaign-1",
        budget: { budgetType: "DAILY", budget: 6 },
        reason: "Reduce daily budget from 12 to 6 only after reviewing SKU fit and ad group bids; 83.33% of spend is high-priority zero-sale SKU spend."
      }]
    });
  });

  it("builds a balanced sales-growth and budget-efficiency plan from search-term, SKU, and budget signals", () => {
    expect(buildAmazonCampaignBudgetSalesPlan({
      searchTermAnalysis: {
        rowCount: 3,
        campaignCount: 2,
        totalSpend: 118,
        totalSales: 180,
        blendedAcos: 65.56,
        wasteSearchTerms: [
          { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", matchType: "BROAD", targeting: "crochet keychain", searchTerm: "free crochet pattern", clicks: 80, spend: 48, sales: 0, orders: 0, recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders." }
        ],
        efficientSearchTerms: [
          { campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupId: "adgroup-2", adGroupName: "Exact Winners", matchType: "EXACT", targeting: "crochet bag charm", searchTerm: "crochet bag charm", clicks: 50, spend: 40, sales: 180, orders: 6, acos: 22.22, recommendation: "Keep active; consider moving to exact match or modest bid increase only after budget waste is reduced." }
        ],
        recommendations: []
      },
      actionPlan: {
        totalActionCount: 2,
        highPriorityCount: 1,
        targetSpendNoSalesCount: 1,
        highSpendNoSalesCount: 0,
        skuCampaignActions: [
          { sku: "DH-E37S-W6DM", campaignIds: ["campaign-1"], campaignNames: ["Auto Discovery"], campaignBreakdowns: [{ campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupIds: ["adgroup-1"], spend: 32, sales: 0, orders: 0 }], spend: 32, sales: 0, orders: 0, signal: "target_spend_no_sales", priority: "high", actionType: "reduce_spend_or_listing_review", recommendation: "Reduce spend pressure or review listing conversion for DH-E37S-W6DM; this target SKU has ad spend but no recent SKU-level sales.", sellerApprovalRequired: true },
          { sku: "5H-2EH1-7H77", campaignIds: ["campaign-2"], campaignNames: ["Manual Exact Winners"], campaignBreakdowns: [{ campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupIds: ["adgroup-2"], spend: 18, sales: 184.9, orders: 1 }], spend: 18, sales: 184.9, orders: 1, signal: "target_sold", priority: "normal", actionType: "monitor_target_seller_sales_vs_ad_attribution", recommendation: "Keep 5H-2EH1-7H77 active, but do not scale blindly until seller-order sales and Ads attribution agree.", sellerApprovalRequired: true }
        ]
      },
      budgetReviewPreview: {
        operation: "preview_amazon_ads_sku_campaign_budget_reviews",
        applied: false,
        warning: "Preview only.",
        budgetReviewCount: 1,
        campaignBudgetReviews: [{
          campaignId: "campaign-1",
          campaignName: "Auto Discovery",
          currentBudget: { budgetType: "DAILY", budget: 18 },
          suggestedBudget: { budgetType: "DAILY", budget: 9 },
          reason: "Reduce daily budget from 18 to 9 only after reviewing SKU fit and ad group bids; 83.73% of spend is high-priority zero-sale SKU spend.",
          affectedSkus: ["DH-E37S-W6DM"],
          sellerApprovalRequired: true
        }],
        campaignBudgetUpdates: [{
          campaignId: "campaign-1",
          budget: { budgetType: "DAILY", budget: 9 },
          reason: "Reduce daily budget from 18 to 9 only after reviewing SKU fit and ad group bids; 83.73% of spend is high-priority zero-sale SKU spend."
        }]
      }
    })).toEqual({
      operation: "preview_amazon_ads_budget_sales_strategy",
      applied: false,
      strategy: "balance_sales_growth_and_budget_efficiency",
      budgetProtection: {
        priority: "high",
        wasteTermCount: 1,
        budgetReviewCount: 1,
        recommendedActions: [
          "Review and apply 1 negative exact candidate(s) from search terms with spend or clicks but no orders.",
          "Review 1 campaign budget reduction payload(s) as spend reallocation candidates, not pure sales-limiting cuts."
        ]
      },
      salesGrowth: {
        priority: "high",
        efficientTermCount: 1,
        recommendedActions: [
          "Move 1 efficient search term(s) into controlled exact campaigns or protect them from budget cuts so savings can be reinvested into demand.",
          "Keep 1 SKU(s) with recent sales active, but scale only after Ads attribution and seller orders agree."
        ]
      },
      listingConversion: {
        priority: "high",
        skuReviewCount: 1,
        recommendedActions: [
          "Review listing conversion for 1 advertised SKU(s) with spend but no recent SKU-level sales before raising bids or budgets."
        ]
      },
      cadence: "Run daily while spend is high, then weekly after ACOS and order trend stabilize."
    });
  });
});
