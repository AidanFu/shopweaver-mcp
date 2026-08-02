import { analyzeAmazonSearchTermReportRows, type AmazonCampaignMetrics } from "./campaign-optimization.js";
import { readAmazonSearchTermReportRows } from "./campaign-report-file.js";
import type { AmazonAdsChangeLog, AmazonAdsChangeLogRecord } from "./ads-change-log.js";

interface AmazonAdsOptimizationSnapshotInput {
  label: string;
  startDate: string;
  endDate: string;
  rows: Array<Record<string, unknown>>;
}

interface AmazonAdsOptimizationSnapshot {
  label: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  campaignCount: number;
  totalSpend: number;
  totalSales: number;
  totalOrders: number;
  blendedAcos: number;
  wasteSearchTermCount: number;
  efficientSearchTermCount: number;
  campaigns: AmazonAdsOptimizationCampaignSnapshot[];
}

interface AmazonAdsOptimizationCampaignSnapshot {
  campaignId: string;
  campaignName: string;
  spend: number;
  sales: number;
  clicks: number;
  orders: number;
  acos: number;
}

interface AmazonAdsOptimizationComparisonInput {
  appliedActions?: AmazonAdsChangeLogRecord[];
}

export function summarizeAmazonAdsAppliedActions(actions: AmazonAdsChangeLogRecord[]) {
  const operationCounts = actions.reduce<Record<string, number>>((counts, action) => {
    counts[action.operation] = (counts[action.operation] ?? 0) + 1;
    return counts;
  }, {});
  const campaignIds = new Set<string>();
  for (const action of actions) {
    for (const campaign of payloadArray<{ campaignId?: string }>(action.payload, "campaigns")) {
      if (campaign.campaignId) campaignIds.add(campaign.campaignId);
    }
    for (const negativeKeyword of payloadArray<{ campaignId?: string }>(action.payload, "negativeKeywords")) {
      if (negativeKeyword.campaignId) campaignIds.add(negativeKeyword.campaignId);
    }
  }
  const appliedTimes = actions.map(action => action.createdAt).filter(Boolean).sort() as string[];
  return {
    actionCount: actions.length,
    operationCounts,
    campaignIdCount: campaignIds.size,
    keywordBidUpdateCount: actions.reduce((sum, action) => sum + payloadArray(action.payload, "keywords").length, 0),
    adGroupBidUpdateCount: actions.reduce((sum, action) => sum + payloadArray(action.payload, "adGroups").length, 0),
    negativeKeywordCount: actions.reduce((sum, action) => sum + payloadArray(action.payload, "negativeKeywords").length, 0),
    campaignBudgetUpdateCount: actions.reduce((sum, action) => sum + (action.operation === "amazon_ads_update_campaign_budgets" ? payloadArray(action.payload, "campaigns").length : 0), 0),
    firstAppliedAt: appliedTimes[0],
    lastAppliedAt: appliedTimes.at(-1)
  };
}

export function buildAmazonAdsOptimizationSnapshot(input: AmazonAdsOptimizationSnapshotInput): AmazonAdsOptimizationSnapshot {
  const analysis = analyzeAmazonSearchTermReportRows(input.rows);
  return {
    label: input.label,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: analysis.rowCount,
    campaignCount: analysis.campaignCount,
    totalSpend: analysis.totalSpend,
    totalSales: analysis.totalSales,
    totalOrders: totalOrders(input.rows),
    blendedAcos: analysis.blendedAcos,
    wasteSearchTermCount: analysis.wasteSearchTerms.length,
    efficientSearchTermCount: analysis.efficientSearchTerms.length,
    campaigns: campaignMetrics(input.rows)
  };
}

export function compareAmazonAdsOptimizationSnapshots(before: AmazonAdsOptimizationSnapshot, after: AmazonAdsOptimizationSnapshot, input: AmazonAdsOptimizationComparisonInput = {}) {
  const appliedActions = input.appliedActions ?? [];
  const afterCampaigns = new Map(after.campaigns.map(campaign => [campaign.campaignId, campaign]));
  const campaignChanges = before.campaigns.map(beforeCampaign => {
    const afterCampaign = afterCampaigns.get(beforeCampaign.campaignId) ?? emptyCampaign(beforeCampaign);
    const spendChange = round(afterCampaign.spend - beforeCampaign.spend);
    const salesChange = round(afterCampaign.sales - beforeCampaign.sales);
    const orderChange = afterCampaign.orders - beforeCampaign.orders;
    const acosChange = round(afterCampaign.acos - beforeCampaign.acos);
    const campaignActions = appliedActions.filter(action => actionHasCampaign(action, beforeCampaign.campaignId));
    const campaignVerdict = verdict(spendChange, salesChange, orderChange, acosChange);
    return {
      campaignId: beforeCampaign.campaignId,
      campaignName: beforeCampaign.campaignName,
      spendChange,
      salesChange,
      orderChange,
      acosChange,
      verdict: campaignVerdict,
      ...(campaignActions.length ? {
        appliedActionCount: campaignActions.length,
        appliedActions: campaignActions.map(actionSummary),
        followUpRecommendation: followUpRecommendation(campaignVerdict, spendChange, salesChange, orderChange)
      } : {})
    };
  });
  const spendChange = round(after.totalSpend - before.totalSpend);
  const salesChange = round(after.totalSales - before.totalSales);
  const orderChange = after.totalOrders - before.totalOrders;
  const blendedAcosChange = round(after.blendedAcos - before.blendedAcos);
  return {
    operation: "compare_amazon_ads_optimization_snapshots" as const,
    beforeLabel: before.label,
    afterLabel: after.label,
    spendChange,
    salesChange,
    orderChange,
    blendedAcosChange,
    verdict: verdict(spendChange, salesChange, orderChange, blendedAcosChange),
    ...(appliedActions.length ? {
      appliedActionCount: appliedActions.length,
      appliedActionSummary: summarizeAmazonAdsAppliedActions(appliedActions),
      appliedActions: appliedActions.map(actionSummary)
    } : {}),
    ...(appliedActions.length ? { followUpRecommendations: overallRecommendations(spendChange, salesChange, orderChange) } : {}),
    campaignChanges
  };
}

export async function compareAmazonAdsOptimizationReportFiles(input: {
  beforeLabel: string;
  beforeStartDate: string;
  beforeEndDate: string;
  beforeFilePath: string;
  afterLabel: string;
  afterStartDate: string;
  afterEndDate: string;
  afterFilePath: string;
  profileId?: string;
  changeLog?: Pick<AmazonAdsChangeLog, "read">;
}) {
  const [beforeRows, afterRows, appliedActions] = await Promise.all([
    readAmazonSearchTermReportRows(input.beforeFilePath),
    readAmazonSearchTermReportRows(input.afterFilePath),
    input.profileId && input.changeLog
      ? input.changeLog.read({ profileId: input.profileId, limit: 500 }).then(result => result.records)
      : Promise.resolve([])
  ]);
  return compareAmazonAdsOptimizationSnapshots(
    buildAmazonAdsOptimizationSnapshot({
      label: input.beforeLabel,
      startDate: input.beforeStartDate,
      endDate: input.beforeEndDate,
      rows: beforeRows
    }),
    buildAmazonAdsOptimizationSnapshot({
      label: input.afterLabel,
      startDate: input.afterStartDate,
      endDate: input.afterEndDate,
      rows: afterRows
    }),
    { appliedActions }
  );
}

function campaignMetrics(rows: Array<Record<string, unknown>>): AmazonAdsOptimizationCampaignSnapshot[] {
  const campaigns = new Map<string, AmazonCampaignMetrics>();
  for (const row of rows) {
    const campaignId = text(row.campaignId ?? row["Campaign ID"] ?? row["Campaign Id"]);
    if (!campaignId) continue;
    const current = campaigns.get(campaignId) ?? {
      campaignId,
      campaignName: text(row.campaignName ?? row["Campaign Name"]) || campaignId,
      spend: 0,
      sales: 0,
      clicks: 0,
      orders: 0,
      acos: 0,
      searchTerms: ""
    };
    current.spend = round(current.spend + number(row.cost ?? row.Spend ?? row.Cost));
    current.sales = round(current.sales + number(row.sales7d ?? row["7 Day Total Sales"] ?? row.Sales));
    current.clicks += number(row.clicks ?? row.Clicks);
    current.orders += number(row.purchases7d ?? row["7 Day Total Orders (#)"] ?? row.Orders);
    current.searchTerms = "";
    campaigns.set(campaignId, current);
  }
  return [...campaigns.values()].map(campaign => ({
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    spend: campaign.spend,
    sales: campaign.sales,
    clicks: campaign.clicks,
    orders: campaign.orders,
    acos: campaign.sales > 0 ? round((campaign.spend / campaign.sales) * 100) : 0
  }));
}

function totalOrders(rows: Array<Record<string, unknown>>): number {
  return rows.reduce((sum, row) => sum + number(row.purchases7d ?? row["7 Day Total Orders (#)"] ?? row.Orders), 0);
}

function emptyCampaign(campaign: AmazonAdsOptimizationCampaignSnapshot): AmazonAdsOptimizationCampaignSnapshot {
  return { ...campaign, spend: 0, sales: 0, clicks: 0, orders: 0, acos: 0 };
}

function actionHasCampaign(action: AmazonAdsChangeLogRecord, campaignId: string): boolean {
  const campaigns = (action.payload as { campaigns?: Array<{ campaignId?: string }> }).campaigns ?? [];
  const negativeKeywords = payloadArray<{ campaignId?: string }>(action.payload, "negativeKeywords");
  return campaigns.some(campaign => campaign.campaignId === campaignId) || negativeKeywords.some(keyword => keyword.campaignId === campaignId);
}

function actionSummary(action: AmazonAdsChangeLogRecord) {
  return {
    createdAt: action.createdAt,
    operation: action.operation,
    profileId: action.profileId,
    payload: action.payload
  };
}

function overallRecommendations(spendChange: number, salesChange: number, orderChange: number) {
  if (spendChange < 0 && orderChange >= 0 && salesChange >= 0) {
    return [{
      action: "monitor" as const,
      reason: "Recent Amazon Ads actions correlate with lower spend and stable or improved orders."
    }];
  }
  return [{
    action: "review" as const,
    reason: "Recent Amazon Ads actions need review because spend, sales, or orders did not clearly improve."
  }];
}

function followUpRecommendation(campaignVerdict: "improved" | "regressed" | "mixed", spendChange: number, salesChange: number, orderChange: number) {
  if (campaignVerdict === "improved" && spendChange < 0 && (orderChange > 0 || salesChange > 0)) {
    return {
      action: "monitor" as const,
      reason: "Spend decreased while orders or sales improved after the applied action."
    };
  }
  return {
    action: "review" as const,
    reason: "Campaign result after the applied action is not clearly improved."
  };
}

function verdict(spendChange: number, salesChange: number, orderChange: number, acosChange: number): "improved" | "regressed" | "mixed" {
  if ((spendChange < 0 && orderChange >= 0 && salesChange >= 0) || (orderChange > 0 && acosChange <= 0)) return "improved";
  if (spendChange > 0 && orderChange <= 0 && salesChange <= 0) return "regressed";
  return "mixed";
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function payloadArray<T extends Record<string, unknown>>(payload: Record<string, unknown>, key: string): T[] {
  const value = payload[key];
  return Array.isArray(value) ? value as T[] : [];
}
