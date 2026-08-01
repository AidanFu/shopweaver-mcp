import type { AmazonAdsClient } from "./ads-client.js";
import { analyzeAmazonCampaignSkuSignals, analyzeAmazonSearchTermReportRows, buildAmazonCampaignBudgetSalesPlan, buildAmazonCampaignSkuActionPlan, buildAmazonCampaignSkuBudgetReviewPreview, buildAmazonCampaignSkuCampaignControlPreview, buildAmazonCampaignSkuControlPreview } from "./campaign-optimization.js";

type AmazonAdsSkuOptimizationClient = Pick<AmazonAdsClient, "createSponsoredProductsAdvertisedProductReport" | "getReport" | "downloadReportRows" | "listSponsoredProductsCampaigns">;

export interface AmazonAdsSkuOptimizationCycleInput {
  profileId: string;
  startDate: string;
  endDate: string;
  targetSkus: string[];
  targetSkusWithSales: string[];
  nonTargetSkusWithSales: string[];
  reportId?: string;
}

interface AmazonAdsReportStatus {
  reportId?: string;
  status?: string;
  url?: string;
}

export async function runAmazonAdsSkuOptimizationCycle(amazonAds: AmazonAdsSkuOptimizationClient, input: AmazonAdsSkuOptimizationCycleInput) {
  if (!input.reportId) {
    const created = await amazonAds.createSponsoredProductsAdvertisedProductReport(input.profileId, {
      name: `ShopWeaver SP advertised products ${input.startDate} to ${input.endDate}`,
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: "SUMMARY"
    }) as AmazonAdsReportStatus;
    return {
      operation: "amazon_ads_run_sku_optimization_cycle" as const,
      status: created.status ?? "PENDING",
      reportId: created.reportId,
      reportStartDate: input.startDate,
      reportEndDate: input.endDate,
      applied: false,
      nextStep: "Call again with this reportId after Amazon marks the advertised-product report COMPLETED."
    };
  }

  const report = await amazonAds.getReport(input.profileId, input.reportId) as AmazonAdsReportStatus;
  if (report.status !== "COMPLETED" || !report.url) {
    return {
      operation: "amazon_ads_run_sku_optimization_cycle" as const,
      status: report.status ?? "UNKNOWN",
      reportId: input.reportId,
      applied: false,
      nextStep: "Poll again later."
    };
  }

  const rows = await amazonAds.downloadReportRows(report.url);
  const searchTermAnalysis = analyzeAmazonSearchTermReportRows(rows);
  const targetSkusWithoutSales = input.targetSkus.filter(sku => !input.targetSkusWithSales.includes(sku));
  const analysis = analyzeAmazonCampaignSkuSignals(rows, {
    targetSkus: input.targetSkus,
    targetSkusWithSales: input.targetSkusWithSales,
    targetSkusWithoutSales,
    nonTargetSkusWithSales: input.nonTargetSkusWithSales
  });
  const actionPlan = buildAmazonCampaignSkuActionPlan(analysis);
  const campaignControlPreview = buildAmazonCampaignSkuCampaignControlPreview(analysis, actionPlan);
  const campaignsResponse = await amazonAds.listSponsoredProductsCampaigns(input.profileId, { maxResults: 100 }) as { campaigns?: Array<Record<string, unknown>> };
  const budgetReviewPreview = buildAmazonCampaignSkuBudgetReviewPreview(campaignControlPreview, campaignsResponse.campaigns ?? []);
  return {
    operation: "amazon_ads_run_sku_optimization_cycle" as const,
    status: "COMPLETED",
    reportId: input.reportId,
    rowCount: rows.length,
    skuCampaignCount: analysis.skuCampaigns.length,
    analysis,
    actionPlan,
    controlPreview: buildAmazonCampaignSkuControlPreview(actionPlan),
    campaignControlPreview,
    budgetReviewPreview,
    strategyPlan: buildAmazonCampaignBudgetSalesPlan({ searchTermAnalysis, actionPlan, budgetReviewPreview }),
    applied: false
  };
}
