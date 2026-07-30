import { analyzeAmazonSearchTermReportRows } from "./campaign-optimization.js";
import type { AmazonAdsClient } from "./ads-client.js";

type AmazonAdsCostControlPlanClient = Pick<AmazonAdsClient, "downloadReportRows" | "listSponsoredProductsCampaigns">;

interface AmazonAdsCostControlPlanInput {
  rows: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
}

export function buildAmazonAdsCostControlPlan(input: AmazonAdsCostControlPlanInput) {
  const analysis = analyzeAmazonSearchTermReportRows(input.rows);
  const campaignBudgets = new Map(input.campaigns.map(campaign => [text(campaign.campaignId), campaignBudget(campaign)]));
  const campaignBudgetUpdates = analysis.recommendations
    .filter(recommendation => recommendation.actionType === "budget_watch")
    .map(recommendation => {
      const currentBudget = campaignBudgets.get(recommendation.campaignId);
      if (!currentBudget || currentBudget <= 3) return undefined;
      const budget = Number(Math.max(3, currentBudget * 0.5).toFixed(2));
      return {
        campaignId: recommendation.campaignId,
        budget: { budgetType: "DAILY" as const, budget },
        reason: `Reduce daily budget from ${currentBudget} to ${budget} while zero-order waste terms are handled.`
      };
    })
    .filter(update => update !== undefined);
  const negativeKeywords = analysis.wasteSearchTerms
    .filter(term => term.adGroupId)
    .map(term => ({
      campaignId: term.campaignId,
      adGroupId: term.adGroupId,
      keywordText: term.searchTerm,
      matchType: "NEGATIVE_EXACT" as const,
      state: "ENABLED" as const,
      reason: "Report spend/clicks with zero orders."
    }));
  return {
    operation: "build_amazon_ads_cost_control_plan" as const,
    applied: false,
    negativeKeywordCount: negativeKeywords.length,
    campaignBudgetUpdateCount: campaignBudgetUpdates.length,
    negativeKeywords,
    campaignBudgetUpdates
  };
}

export async function buildAmazonAdsCostControlPlanFromReportUrl(amazonAds: AmazonAdsCostControlPlanClient, input: { profileId: string; url: string }) {
  const rows = await amazonAds.downloadReportRows(input.url);
  const campaignsResponse = await amazonAds.listSponsoredProductsCampaigns(input.profileId, { maxResults: 100 }) as { campaigns?: Array<Record<string, unknown>> };
  return buildAmazonAdsCostControlPlan({
    rows,
    campaigns: campaignsResponse.campaigns ?? []
  });
}

function campaignBudget(campaign: Record<string, unknown>): number {
  const budget = campaign.budget;
  if (typeof budget === "number") return budget;
  if (budget && typeof budget === "object" && "budget" in budget) return number((budget as { budget?: unknown }).budget);
  return 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
