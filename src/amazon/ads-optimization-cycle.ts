import { isAbsolute } from "node:path";
import type { AmazonAdsClient } from "./ads-client.js";
import { analyzeAmazonSearchTermReportRows } from "./campaign-optimization.js";
import { writeAmazonSearchTermOptimizationWorkbookFromRows } from "./campaign-report-file.js";
import { ShopWeaverError } from "../errors.js";

type AmazonAdsCampaignOptimizationClient = Pick<AmazonAdsClient, "createSponsoredProductsSearchTermReport" | "getReport" | "downloadReportRows">;

interface AmazonAdsCampaignOptimizationCycleInput {
  profileId: string;
  startDate: string;
  endDate: string;
  outputPath: string;
  reportId?: string;
}

interface AmazonAdsReportStatus {
  reportId?: string;
  status?: string;
  url?: string;
}

export async function runAmazonAdsCampaignOptimizationCycle(amazonAds: AmazonAdsCampaignOptimizationClient, input: AmazonAdsCampaignOptimizationCycleInput) {
  if (!isAbsolute(input.outputPath)) throw new ShopWeaverError("AMAZON_ADS_OUTPUT_PATH_INVALID", "Amazon Ads optimization workbook output path must be absolute.");
  if (!input.reportId) {
    const created = await amazonAds.createSponsoredProductsSearchTermReport(input.profileId, {
      name: `ShopWeaver SP search terms ${input.startDate} to ${input.endDate}`,
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: "SUMMARY",
      keywordType: ["BROAD", "PHRASE", "EXACT"]
    }) as AmazonAdsReportStatus;
    return {
      operation: "amazon_ads_run_campaign_optimization_cycle" as const,
      status: created.status ?? "PENDING",
      reportId: created.reportId,
      reportStartDate: input.startDate,
      reportEndDate: input.endDate,
      applied: false,
      nextStep: "Call again with this reportId after Amazon marks the report COMPLETED."
    };
  }

  const report = await amazonAds.getReport(input.profileId, input.reportId) as AmazonAdsReportStatus;
  if (report.status !== "COMPLETED" || !report.url) {
    return {
      operation: "amazon_ads_run_campaign_optimization_cycle" as const,
      status: report.status ?? "UNKNOWN",
      reportId: input.reportId,
      applied: false,
      nextStep: "Poll again later."
    };
  }

  const rows = await amazonAds.downloadReportRows(report.url);
  const analysis = analyzeAmazonSearchTermReportRows(rows);
  await writeAmazonSearchTermOptimizationWorkbookFromRows(rows, input.outputPath);
  return {
    operation: "amazon_ads_run_campaign_optimization_cycle" as const,
    status: "COMPLETED",
    reportId: input.reportId,
    outputPath: input.outputPath,
    rowCount: analysis.rowCount,
    campaignCount: analysis.campaignCount,
    totalSpend: analysis.totalSpend,
    totalSales: analysis.totalSales,
    blendedAcos: analysis.blendedAcos,
    wasteSearchTermCount: analysis.wasteSearchTerms.length,
    efficientSearchTermCount: analysis.efficientSearchTerms.length,
    recommendationCount: analysis.recommendations.length,
    applied: false
  };
}
