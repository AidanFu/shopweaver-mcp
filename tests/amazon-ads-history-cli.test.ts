import { describe, expect, it } from "vitest";
import { buildAmazonAdsHistorySummaryResult, parseAmazonAdsHistoryArgs, renderAmazonAdsHistorySummary } from "../src/amazon-ads-history.js";

describe("parseAmazonAdsHistoryArgs", () => {
  it("parses optional change-log summary filters", () => {
    expect(parseAmazonAdsHistoryArgs([
      "--profile-id", "749555662454438",
      "--operation", "amazon_ads_update_campaign_budgets",
      "--campaign-id", "campaign-1",
      "--limit", "25",
      "--format", "summary"
    ])).toEqual({
      profileId: "749555662454438",
      operation: "amazon_ads_update_campaign_budgets",
      campaignId: "campaign-1",
      limit: 25,
      outputFormat: "summary"
    });
  });
});

describe("renderAmazonAdsHistorySummary", () => {
  it("renders compact applied action history learning guidance", () => {
    expect(renderAmazonAdsHistorySummary({
      operation: "summarize_amazon_ads_change_log",
      filters: { profileId: "749555662454438", limit: 25 },
      sourceRecordCount: 2,
      summary: {
        actionCount: 2,
        campaignBudgetUpdateCount: 1,
        keywordBidUpdateCount: 0,
        adGroupBidUpdateCount: 0,
        negativeKeywordCount: 1
      },
      learningPlan: {
        actionMix: "balanced_cost_and_query_cleanup",
        priority: "high",
        recommendations: [
          "Compare the next Sponsored Products report against the pre-change baseline before applying another budget cut.",
          "Track whether negative keywords reduced irrelevant clicks without reducing orders from adjacent converting terms."
        ],
        cadence: "Review after 3-7 days of post-change traffic, then weekly once spend and order trend stabilize."
      }
    })).toBe([
      "Amazon Ads Change Log Summary",
      "Records: 2 | profile: 749555662454438 | operation: all | campaign: all",
      "Applied actions: 2 | budgets: 1 | keyword bids: 0 | ad group bids: 0 | negatives: 1",
      "Learning plan: balanced_cost_and_query_cleanup | priority: high",
      "- Compare the next Sponsored Products report against the pre-change baseline before applying another budget cut.",
      "- Track whether negative keywords reduced irrelevant clicks without reducing orders from adjacent converting terms.",
      "Cadence: Review after 3-7 days of post-change traffic, then weekly once spend and order trend stabilize."
    ].join("\n"));
  });
});

describe("buildAmazonAdsHistorySummaryResult", () => {
  it("summarizes records read from the change log", async () => {
    const changeLog = {
      read: async () => ({
        operation: "read_amazon_ads_change_log" as const,
        recordCount: 1,
        records: [{
          createdAt: "2026-07-30T20:45:00.000Z",
          operation: "amazon_ads_update_campaign_budgets",
          profileId: "profile-1",
          applied: true as const,
          payload: { campaigns: [{ campaignId: "campaign-1" }] },
          result: {}
        }]
      })
    };

    await expect(buildAmazonAdsHistorySummaryResult(changeLog, { profileId: "profile-1", outputFormat: "json" })).resolves.toMatchObject({
      operation: "summarize_amazon_ads_change_log",
      filters: { profileId: "profile-1" },
      sourceRecordCount: 1,
      summary: {
        actionCount: 1,
        campaignBudgetUpdateCount: 1
      },
      learningPlan: {
        actionMix: "budget_control"
      }
    });
  });
});
