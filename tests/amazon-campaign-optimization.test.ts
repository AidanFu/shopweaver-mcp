import { describe, expect, it } from "vitest";
import { analyzeAmazonCampaignMetrics, analyzeAmazonSearchTermReportRows } from "../src/amazon/campaign-optimization.js";

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
      { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", searchTerm: "free crochet pattern", clicks: 80, cost: 48, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", searchTerm: "crochet keychain", clicks: 45, cost: 30, sales7d: 0, purchases7d: 0 },
      { campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupId: "adgroup-2", adGroupName: "Exact Winners", searchTerm: "crochet bag charm", clicks: 50, cost: 40, sales7d: 180, purchases7d: 6 }
    ])).toEqual({
      rowCount: 3,
      campaignCount: 2,
      totalSpend: 118,
      totalSales: 180,
      blendedAcos: 65.56,
      wasteSearchTerms: [
        { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", searchTerm: "free crochet pattern", clicks: 80, spend: 48, sales: 0, orders: 0, recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders." },
        { campaignId: "campaign-1", campaignName: "Auto Discovery", adGroupId: "adgroup-1", adGroupName: "Discovery", searchTerm: "crochet keychain", clicks: 45, spend: 30, sales: 0, orders: 0, recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders." }
      ],
      efficientSearchTerms: [
        { campaignId: "campaign-2", campaignName: "Manual Exact Winners", adGroupId: "adgroup-2", adGroupName: "Exact Winners", searchTerm: "crochet bag charm", clicks: 50, spend: 40, sales: 180, orders: 6, acos: 22.22, recommendation: "Keep active; consider moving to exact match or modest bid increase only after budget waste is reduced." }
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
});
