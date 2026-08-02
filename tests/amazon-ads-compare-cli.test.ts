import { describe, expect, it } from "vitest";
import { parseAmazonAdsCompareArgs, renderAmazonAdsComparisonSummary } from "../src/amazon-ads-compare.js";

describe("parseAmazonAdsCompareArgs", () => {
  it("parses report comparison arguments with optional profile history", () => {
    expect(parseAmazonAdsCompareArgs([
      "--before-label", "before",
      "--before-start-date", "2026-07-16",
      "--before-end-date", "2026-07-29",
      "--before-file", "/tmp/before.csv",
      "--after-label", "after",
      "--after-start-date", "2026-07-30",
      "--after-end-date", "2026-08-05",
      "--after-file", "/tmp/after.csv",
      "--profile-id", "749555662454438"
    ])).toEqual({
      beforeLabel: "before",
      beforeStartDate: "2026-07-16",
      beforeEndDate: "2026-07-29",
      beforeFilePath: "/tmp/before.csv",
      afterLabel: "after",
      afterStartDate: "2026-07-30",
      afterEndDate: "2026-08-05",
      afterFilePath: "/tmp/after.csv",
      profileId: "749555662454438",
      outputFormat: "json"
    });
  });

  it("parses summary output format", () => {
    expect(parseAmazonAdsCompareArgs([
      "--before-label", "before",
      "--before-start-date", "2026-07-16",
      "--before-end-date", "2026-07-29",
      "--before-file", "/tmp/before.csv",
      "--after-label", "after",
      "--after-start-date", "2026-07-30",
      "--after-end-date", "2026-08-05",
      "--after-file", "/tmp/after.csv",
      "--format", "summary"
    ])).toMatchObject({ outputFormat: "summary" });
  });

  it("renders a compact comparison summary with learning guidance", () => {
    expect(renderAmazonAdsComparisonSummary({
      beforeLabel: "before",
      afterLabel: "after",
      verdict: "improved",
      spendChange: -54.73,
      salesChange: 89.99,
      orderChange: 1,
      blendedAcosChange: 20,
      appliedActionSummary: {
        actionCount: 2,
        negativeKeywordCount: 1,
        campaignBudgetUpdateCount: 1,
        keywordBidUpdateCount: 0,
        adGroupBidUpdateCount: 0
      },
      appliedActionLearningPlan: {
        actionMix: "balanced_cost_and_query_cleanup",
        priority: "high",
        recommendations: [
          "Compare the next Sponsored Products report against the pre-change baseline before applying another budget cut.",
          "Track whether negative keywords reduced irrelevant clicks without reducing orders from adjacent converting terms."
        ],
        cadence: "Review after 3-7 days of post-change traffic, then weekly once spend and order trend stabilize."
      },
      campaignChanges: [{
        campaignId: "campaign-1",
        campaignName: "Exact Waste",
        verdict: "improved",
        spendChange: -54.73,
        salesChange: 89.99,
        orderChange: 1
      }]
    })).toBe([
      "Amazon Ads Optimization Comparison",
      "before -> after | verdict: improved",
      "Spend: -54.73 | Sales: 89.99 | Orders: 1 | Blended ACOS: 20",
      "Applied actions: 2 | budgets: 1 | keyword bids: 0 | ad group bids: 0 | negatives: 1",
      "Learning plan: balanced_cost_and_query_cleanup | priority: high",
      "- Compare the next Sponsored Products report against the pre-change baseline before applying another budget cut.",
      "- Track whether negative keywords reduced irrelevant clicks without reducing orders from adjacent converting terms.",
      "Cadence: Review after 3-7 days of post-change traffic, then weekly once spend and order trend stabilize.",
      "Campaign changes:",
      "- campaign-1 | Exact Waste | improved | spend -54.73 | sales 89.99 | orders 1"
    ].join("\n"));
  });
});
