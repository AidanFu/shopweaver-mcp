import { describe, expect, it } from "vitest";
import { analyzeAmazonCampaignMetrics } from "../src/amazon/campaign-optimization.js";

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
});
