import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { runAmazonAdsCampaignOptimizationCycle } from "../src/amazon/ads-optimization-cycle.js";

describe("runAmazonAdsCampaignOptimizationCycle", () => {
  it("creates a Sponsored Products search-term report when no report ID is provided", async () => {
    const calls: unknown[] = [];
    const client = {
      async createSponsoredProductsSearchTermReport(profileId: string, input: unknown) {
        calls.push({ profileId, input });
        return { reportId: "report-1", status: "PENDING" };
      },
      async getReport() {
        throw new Error("not expected");
      },
      async downloadReportRows() {
        throw new Error("not expected");
      }
    };

    await expect(runAmazonAdsCampaignOptimizationCycle(client, {
      profileId: "profile-1",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      outputPath: join(tmpdir(), "unused.xlsx")
    })).resolves.toEqual({
      operation: "amazon_ads_run_campaign_optimization_cycle",
      status: "PENDING",
      reportId: "report-1",
      reportStartDate: "2026-07-16",
      reportEndDate: "2026-07-29",
      applied: false,
      nextStep: "Call again with this reportId after Amazon marks the report COMPLETED."
    });
    expect(calls).toEqual([{
      profileId: "profile-1",
      input: {
        name: "ShopWeaver SP search terms 2026-07-16 to 2026-07-29",
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        timeUnit: "SUMMARY",
        keywordType: ["BROAD", "PHRASE", "EXACT"]
      }
    }]);
  });

  it("polls an existing report without downloading until it is complete", async () => {
    const client = {
      async createSponsoredProductsSearchTermReport() {
        throw new Error("not expected");
      },
      async getReport(profileId: string, reportId: string) {
        return { profileId, reportId, status: "IN_PROGRESS" };
      },
      async downloadReportRows() {
        throw new Error("not expected");
      }
    };

    await expect(runAmazonAdsCampaignOptimizationCycle(client, {
      profileId: "profile-1",
      reportId: "report-1",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      outputPath: join(tmpdir(), "unused.xlsx")
    })).resolves.toEqual({
      operation: "amazon_ads_run_campaign_optimization_cycle",
      status: "IN_PROGRESS",
      reportId: "report-1",
      applied: false,
      nextStep: "Poll again later."
    });
  });

  it("downloads a completed report, analyzes it, and writes an optimization workbook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-cycle-"));
    const outputPath = join(dir, "optimization.xlsx");
    const client = {
      async createSponsoredProductsSearchTermReport() {
        throw new Error("not expected");
      },
      async getReport() {
        return { reportId: "report-1", status: "COMPLETED", url: "https://example.test/report.gz" };
      },
      async downloadReportRows(url: string) {
        expect(url).toBe("https://example.test/report.gz");
        return [
          {
            campaignId: "campaign-1",
            campaignName: "Waste Campaign",
            adGroupId: "adgroup-1",
            adGroupName: "Waste Group",
            matchType: "BROAD",
            targeting: "towel warmer",
            searchTerm: "free towel warmer",
            clicks: 18,
            cost: 12.5,
            sales7d: 0,
            purchases7d: 0
          },
          {
            campaignId: "campaign-2",
            campaignName: "Winner Campaign",
            adGroupId: "adgroup-2",
            adGroupName: "Winner Group",
            matchType: "EXACT",
            targeting: "electric towel warmer gold",
            searchTerm: "electric towel warmer gold",
            clicks: 12,
            cost: 9,
            sales7d: 89.99,
            purchases7d: 1
          }
        ];
      }
    };

    await expect(runAmazonAdsCampaignOptimizationCycle(client, {
      profileId: "profile-1",
      reportId: "report-1",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      outputPath
    })).resolves.toMatchObject({
      operation: "amazon_ads_run_campaign_optimization_cycle",
      status: "COMPLETED",
      reportId: "report-1",
      outputPath,
      rowCount: 2,
      totalSpend: 21.5,
      totalSales: 89.99,
      wasteSearchTermCount: 1,
      efficientSearchTermCount: 1,
      applied: false
    });
    const workbook = XLSX.readFile(outputPath);
    expect(workbook.SheetNames).toContain("Action Plan");
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Action Plan"])).toHaveLength(2);
  });
});
