import { describe, expect, it } from "vitest";
import { analyzeAmazonCampaignMetrics, analyzeAmazonSearchTermReportRows } from "../src/amazon/campaign-optimization.js";

describe("analyzeAmazonCampaignMetrics", () => {
  it("flags spend with clicks but no orders for search-term and listing review", () => {
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
      actionType: "negative_keywords_and_listing_review",
      recommendation: "Review search terms and listing conversion before increasing budget; add irrelevant terms as negative keyword candidates after seller approval.",
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
      { campaignId: "campaign-1", campaignName: "Auto Discovery", searchTerm: "free crochet pattern", clicks: 80, cost: 48, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-1", campaignName: "Auto Discovery", searchTerm: "crochet keychain", clicks: 45, cost: 30, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-2", campaignName: "Manual Exact Winners", searchTerm: "crochet bag charm", clicks: 50, cost: 40, sales7d: 180, purchases7d: 6 }
    ])).toEqual({
      rowCount: 3,
      campaignCount: 2,
      recommendations: [{
        campaignId: "campaign-1",
        campaignName: "Auto Discovery",
        status: "reduce_waste",
        priority: "high",
        actionType: "negative_keywords_and_listing_review",
        recommendation: "Review search terms and listing conversion before increasing budget; add irrelevant terms as negative keyword candidates after seller approval.",
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
});
