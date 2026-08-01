import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAmazonAdsOptimizationSnapshot, compareAmazonAdsOptimizationReportFiles, compareAmazonAdsOptimizationSnapshots } from "../src/amazon/ads-optimization-history.js";

describe("Amazon Ads optimization history", () => {
  it("builds a campaign-level optimization snapshot from report rows", () => {
    expect(buildAmazonAdsOptimizationSnapshot({
      label: "before",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      rows: [
        { campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 55, cost: 72.73, sales7d: 0, purchases7d: 0, searchTerm: "bad term" },
        { campaignId: "campaign-2", campaignName: "Exact Winner", clicks: 20, cost: 20, sales7d: 189.99, purchases7d: 1, searchTerm: "good term" }
      ]
    })).toEqual({
      label: "before",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      rowCount: 2,
      campaignCount: 2,
      totalSpend: 92.73,
      totalSales: 189.99,
      totalOrders: 1,
      blendedAcos: 48.81,
      wasteSearchTermCount: 1,
      efficientSearchTermCount: 1,
      campaigns: [
        {
          campaignId: "campaign-1",
          campaignName: "Exact Waste",
          spend: 72.73,
          sales: 0,
          clicks: 55,
          orders: 0,
          acos: 0
        },
        {
          campaignId: "campaign-2",
          campaignName: "Exact Winner",
          spend: 20,
          sales: 189.99,
          clicks: 20,
          orders: 1,
          acos: 10.53
        }
      ]
    });
  });

  it("compares snapshots and flags improvement after cost-control actions", () => {
    const before = buildAmazonAdsOptimizationSnapshot({
      label: "before",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 55, cost: 72.73, sales7d: 0, purchases7d: 0, searchTerm: "bad term" }]
    });
    const after = buildAmazonAdsOptimizationSnapshot({
      label: "after",
      startDate: "2026-07-30",
      endDate: "2026-08-05",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 15, cost: 18, sales7d: 89.99, purchases7d: 1, searchTerm: "good term" }]
    });

    expect(compareAmazonAdsOptimizationSnapshots(before, after)).toEqual({
      operation: "compare_amazon_ads_optimization_snapshots",
      beforeLabel: "before",
      afterLabel: "after",
      spendChange: -54.73,
      salesChange: 89.99,
      orderChange: 1,
      blendedAcosChange: 20,
      verdict: "improved",
      campaignChanges: [{
        campaignId: "campaign-1",
        campaignName: "Exact Waste",
        spendChange: -54.73,
        salesChange: 89.99,
        orderChange: 1,
        acosChange: 20,
        verdict: "improved"
      }]
    });
  });

  it("connects applied campaign actions to later campaign metric changes", () => {
    const before = buildAmazonAdsOptimizationSnapshot({
      label: "before",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 55, cost: 72.73, sales7d: 0, purchases7d: 0, searchTerm: "bad term" }]
    });
    const after = buildAmazonAdsOptimizationSnapshot({
      label: "after",
      startDate: "2026-07-30",
      endDate: "2026-08-05",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 15, cost: 18, sales7d: 89.99, purchases7d: 1, searchTerm: "good term" }]
    });

    expect(compareAmazonAdsOptimizationSnapshots(before, after, {
      appliedActions: [{
        createdAt: "2026-07-30T20:45:00.000Z",
        operation: "amazon_ads_update_campaign_bidding",
        profileId: "profile-1",
        applied: true,
        payload: { campaigns: [{ campaignId: "campaign-1" }] },
        result: { campaigns: { success: [{ campaignId: "campaign-1" }], error: [] } }
      }]
    })).toMatchObject({
      appliedActionCount: 1,
      followUpRecommendations: [{
        action: "monitor",
        reason: "Recent Amazon Ads actions correlate with lower spend and stable or improved orders."
      }],
      campaignChanges: [{
        campaignId: "campaign-1",
        appliedActionCount: 1,
        followUpRecommendation: {
          action: "monitor",
          reason: "Spend decreased while orders or sales improved after the applied action."
        },
        appliedActions: [{
          createdAt: "2026-07-30T20:45:00.000Z",
          operation: "amazon_ads_update_campaign_bidding"
        }]
      }]
    });
  });

  it("recommends review when applied actions correlate with worse campaign results", () => {
    const before = buildAmazonAdsOptimizationSnapshot({
      label: "before",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 20, cost: 20, sales7d: 89.99, purchases7d: 1, searchTerm: "good term" }]
    });
    const after = buildAmazonAdsOptimizationSnapshot({
      label: "after",
      startDate: "2026-07-30",
      endDate: "2026-08-05",
      rows: [{ campaignId: "campaign-1", campaignName: "Exact Waste", clicks: 55, cost: 72.73, sales7d: 0, purchases7d: 0, searchTerm: "bad term" }]
    });

    expect(compareAmazonAdsOptimizationSnapshots(before, after, {
      appliedActions: [{
        createdAt: "2026-07-30T20:45:00.000Z",
        operation: "amazon_ads_update_keyword_bids",
        profileId: "profile-1",
        applied: true,
        payload: { campaigns: [{ campaignId: "campaign-1" }] },
        result: { campaigns: { success: [{ campaignId: "campaign-1" }], error: [] } }
      }]
    })).toMatchObject({
      followUpRecommendations: [{
        action: "review",
        reason: "Recent Amazon Ads actions need review because spend, sales, or orders did not clearly improve."
      }],
      campaignChanges: [{
        campaignId: "campaign-1",
        verdict: "regressed",
        followUpRecommendation: {
          action: "review",
          reason: "Campaign result after the applied action is not clearly improved."
        }
      }]
    });
  });

  it("compares two local search-term report files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-history-"));
    const beforeFile = join(dir, "before.csv");
    const afterFile = join(dir, "after.csv");
    await writeFile(beforeFile, [
      "Campaign ID,Campaign Name,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "campaign-1,Exact Waste,bad term,55,$72.73,$0,0"
    ].join("\n"));
    await writeFile(afterFile, [
      "Campaign ID,Campaign Name,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "campaign-1,Exact Waste,good term,15,$18,$89.99,1"
    ].join("\n"));

    await expect(compareAmazonAdsOptimizationReportFiles({
      beforeLabel: "before",
      beforeStartDate: "2026-07-16",
      beforeEndDate: "2026-07-29",
      beforeFilePath: beforeFile,
      afterLabel: "after",
      afterStartDate: "2026-07-30",
      afterEndDate: "2026-08-05",
      afterFilePath: afterFile
    })).resolves.toMatchObject({
      operation: "compare_amazon_ads_optimization_snapshots",
      verdict: "improved",
      spendChange: -54.73,
      orderChange: 1
    });
  });

  it("includes matching change-log actions when comparing local report files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-history-"));
    const beforeFile = join(dir, "before.csv");
    const afterFile = join(dir, "after.csv");
    await writeFile(beforeFile, [
      "Campaign ID,Campaign Name,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "campaign-1,Exact Waste,bad term,55,$72.73,$0,0"
    ].join("\n"));
    await writeFile(afterFile, [
      "Campaign ID,Campaign Name,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "campaign-1,Exact Waste,good term,15,$18,$89.99,1"
    ].join("\n"));
    const changeLog = {
      read: async () => ({
        operation: "read_amazon_ads_change_log" as const,
        recordCount: 1,
        records: [{
          createdAt: "2026-07-30T20:45:00.000Z",
          operation: "amazon_ads_update_campaign_bidding",
          profileId: "profile-1",
          applied: true as const,
          payload: { campaigns: [{ campaignId: "campaign-1" }] },
          result: { campaigns: { success: [{ campaignId: "campaign-1" }], error: [] } }
        }]
      })
    };

    await expect(compareAmazonAdsOptimizationReportFiles({
      beforeLabel: "before",
      beforeStartDate: "2026-07-16",
      beforeEndDate: "2026-07-29",
      beforeFilePath: beforeFile,
      afterLabel: "after",
      afterStartDate: "2026-07-30",
      afterEndDate: "2026-08-05",
      afterFilePath: afterFile,
      profileId: "profile-1",
      changeLog
    })).resolves.toMatchObject({
      appliedActionCount: 1,
      campaignChanges: [{
        campaignId: "campaign-1",
        appliedActionCount: 1,
        appliedActions: [{ operation: "amazon_ads_update_campaign_bidding" }]
      }]
    });
  });
});
