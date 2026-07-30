import { describe, expect, it } from "vitest";
import { buildAmazonAdsCostControlPlan, buildAmazonAdsCostControlPlanFromReportUrl } from "../src/amazon/ads-cost-control-plan.js";

describe("buildAmazonAdsCostControlPlan", () => {
  it("turns waste search terms and budget-watch campaigns into write-preview payloads", () => {
    const plan = buildAmazonAdsCostControlPlan({
      rows: [
        {
          campaignId: "campaign-1",
          campaignName: "Exact | waste",
          adGroupId: "adgroup-1",
          adGroupName: "Exact",
          searchTerm: "heated towel racks for bathroom",
          clicks: 55,
          cost: 72.73,
          sales7d: 0,
          purchases7d: 0
        },
        {
          campaignId: "campaign-2",
          campaignName: "Exact | efficient",
          adGroupId: "adgroup-2",
          searchTerm: "heated towel rack",
          clicks: 20,
          cost: 20,
          sales7d: 189.99,
          purchases7d: 1
        }
      ],
      campaigns: [
        { campaignId: "campaign-1", name: "Exact | waste", budget: { budget: 6, budgetType: "DAILY" } },
        { campaignId: "campaign-2", name: "Exact | efficient", budget: { budget: 18, budgetType: "DAILY" } }
      ]
    });

    expect(plan).toEqual({
      operation: "build_amazon_ads_cost_control_plan",
      applied: false,
      negativeKeywordCount: 1,
      campaignBudgetUpdateCount: 1,
      negativeKeywords: [{
        campaignId: "campaign-1",
        adGroupId: "adgroup-1",
        keywordText: "heated towel racks for bathroom",
        matchType: "NEGATIVE_EXACT",
        state: "ENABLED",
        reason: "Report spend/clicks with zero orders."
      }],
      campaignBudgetUpdates: [{
        campaignId: "campaign-1",
        budget: { budgetType: "DAILY", budget: 3 },
        reason: "Reduce daily budget from 6 to 3 while zero-order waste terms are handled."
      }]
    });
  });

  it("downloads report rows and reads current campaign budgets for a live-style plan", async () => {
    const amazonAds = {
      async downloadReportRows(url: string) {
        expect(url).toBe("https://example.test/report.gz");
        return [{
          campaignId: "campaign-1",
          campaignName: "Exact | waste",
          adGroupId: "adgroup-1",
          searchTerm: "heated towel racks for bathroom",
          clicks: 55,
          cost: 72.73,
          sales7d: 0,
          purchases7d: 0
        }];
      },
      async listSponsoredProductsCampaigns(profileId: string, body: Record<string, unknown>) {
        expect(profileId).toBe("profile-1");
        expect(body).toEqual({ maxResults: 100 });
        return { campaigns: [{ campaignId: "campaign-1", budget: { budget: 6, budgetType: "DAILY" } }] };
      }
    };

    await expect(buildAmazonAdsCostControlPlanFromReportUrl(amazonAds, {
      profileId: "profile-1",
      url: "https://example.test/report.gz"
    })).resolves.toMatchObject({
      operation: "build_amazon_ads_cost_control_plan",
      negativeKeywordCount: 1,
      campaignBudgetUpdateCount: 1,
      applied: false
    });
  });
});
