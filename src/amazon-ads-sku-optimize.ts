#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { AmazonAdsClient } from "./amazon/ads-client.js";
import { type AmazonAdsSkuOptimizationCycleInput, runAmazonAdsSkuOptimizationCycle } from "./amazon/ads-sku-optimization-cycle.js";
import type { AmazonNormalizedSalesSignal } from "./amazon/campaign-optimization.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

export interface AmazonAdsSkuOptimizeArgs extends AmazonAdsSkuOptimizationCycleInput {
  outputFormat: "json" | "summary" | "apply-plan" | "budget-preview" | "keyword-bids-preview" | "ad-group-bids-preview" | "negative-keywords-preview";
  salesSignalsPath?: string;
  optimizationRulesPath?: string;
}

export function parseAmazonAdsSkuOptimizeArgs(args: string[]): AmazonAdsSkuOptimizeArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const profileId = values.get("--profile-id");
  const startDate = values.get("--start-date");
  const endDate = values.get("--end-date");
  const targetSkus = splitCsv(values.get("--target-skus") ?? "");
  if (!profileId || !startDate || !endDate || targetSkus.length === 0) throw usageError();
  return {
    profileId,
    startDate,
    endDate,
    targetSkus,
    targetSkusWithSales: splitCsv(values.get("--target-skus-with-sales") ?? ""),
    nonTargetSkusWithSales: splitCsv(values.get("--non-target-skus-with-sales") ?? ""),
    outputFormat: outputFormat(values.get("--format")),
    ...(values.get("--sales-signals") ? { salesSignalsPath: values.get("--sales-signals") } : {}),
    ...(values.get("--optimization-rules") ? { optimizationRulesPath: values.get("--optimization-rules") } : {}),
    ...(values.get("--report-id") ? { reportId: values.get("--report-id") } : {})
  };
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const amazonAds = new AmazonAdsClient(store);
  const args = parseAmazonAdsSkuOptimizeArgs(process.argv.slice(2));
  const result = await runAmazonAdsSkuOptimizationCycle(amazonAds, {
    ...args,
    ...(args.salesSignalsPath ? { salesSignals: await loadAmazonAdsSkuSalesSignals(args.salesSignalsPath) } : {})
  });
  const output = args.optimizationRulesPath
    ? { ...result, nextOptimizationRules: await loadAmazonAdsSkuOptimizationRules(args.optimizationRulesPath) }
    : result;
  stdout.write(`${renderAmazonAdsSkuOptimizationResult(args, output)}\n`);
}

export async function loadAmazonAdsSkuSalesSignals(filePath: string): Promise<AmazonNormalizedSalesSignal[]> {
  const input = JSON.parse(await readFile(filePath, "utf8")) as {
    salesSignals?: AmazonNormalizedSalesSignal[];
    adsOrderComparison?: { salesSignals?: AmazonNormalizedSalesSignal[] };
  } | AmazonNormalizedSalesSignal[];
  if (Array.isArray(input)) return input;
  return input.adsOrderComparison?.salesSignals ?? input.salesSignals ?? [];
}

export async function loadAmazonAdsSkuOptimizationRules(filePath: string): Promise<Array<Record<string, unknown>>> {
  const input = JSON.parse(await readFile(filePath, "utf8")) as {
    nextOptimizationRules?: Array<Record<string, unknown>>;
    adsComparison?: { nextOptimizationRules?: Array<Record<string, unknown>> };
  } | Array<Record<string, unknown>>;
  if (Array.isArray(input)) return input;
  return input.adsComparison?.nextOptimizationRules ?? input.nextOptimizationRules ?? [];
}

function renderAmazonAdsSkuOptimizationResult(args: AmazonAdsSkuOptimizeArgs, result: Record<string, any>): string {
  if (args.outputFormat === "summary") return renderAmazonAdsSkuOptimizationSummary(result);
  if (args.outputFormat === "apply-plan") return JSON.stringify(buildAmazonAdsSkuApplyPlanPayload(args.profileId, result), null, 2);
  if (args.outputFormat === "budget-preview") return JSON.stringify(buildAmazonAdsSkuBudgetPreviewPayload(args.profileId, result), null, 2);
  if (args.outputFormat === "keyword-bids-preview") return JSON.stringify(buildAmazonAdsSkuKeywordBidsPreviewPayload(args.profileId, result), null, 2);
  if (args.outputFormat === "ad-group-bids-preview") return JSON.stringify(buildAmazonAdsSkuAdGroupBidsPreviewPayload(args.profileId, result), null, 2);
  if (args.outputFormat === "negative-keywords-preview") return JSON.stringify(buildAmazonAdsSkuNegativeKeywordsPreviewPayload(args.profileId, result), null, 2);
  return JSON.stringify(result, null, 2);
}

export function buildAmazonAdsSkuBudgetPreviewPayload(profileId: string, result: Record<string, any>) {
  return {
    tool: "amazon_ads_update_campaign_budgets",
    mode: "preview",
    profileId,
    campaigns: result.budgetReviewPreview?.campaignBudgetUpdates ?? [],
    applied: false,
    warning: "Preview payload only. Submit this to amazon_ads_update_campaign_budgets in preview mode, then confirm with the returned token to write."
  };
}

export function buildAmazonAdsSkuKeywordBidsPreviewPayload(profileId: string, result: Record<string, any>) {
  return {
    tool: "amazon_ads_update_keyword_bids",
    mode: "preview",
    profileId,
    keywords: result.bidKeywordPreview?.keywordBidUpdates ?? [],
    applied: false,
    warning: "Preview payload only. Submit this to amazon_ads_update_keyword_bids in preview mode, then confirm with the returned token to write."
  };
}

export function buildAmazonAdsSkuAdGroupBidsPreviewPayload(profileId: string, result: Record<string, any>) {
  return {
    tool: "amazon_ads_update_ad_group_bids",
    mode: "preview",
    profileId,
    adGroups: result.bidKeywordPreview?.adGroupBidUpdates ?? [],
    applied: false,
    warning: "Preview payload only. Submit this to amazon_ads_update_ad_group_bids in preview mode, then confirm with the returned token to write."
  };
}

export function buildAmazonAdsSkuNegativeKeywordsPreviewPayload(profileId: string, result: Record<string, any>) {
  return {
    tool: "amazon_ads_create_negative_keywords",
    mode: "preview",
    profileId,
    negativeKeywords: result.bidKeywordPreview?.negativeKeywords ?? [],
    applied: false,
    warning: "Preview payload only. Use this as a direct negative-keyword review payload; Amazon write support still requires the gated negative-keyword confirmation flow."
  };
}

export function buildAmazonAdsSkuApplyPlanPayload(profileId: string, result: Record<string, any>) {
  const campaignCreations = buildAmazonAdsSkuCampaignCreationCandidates(result.bidKeywordPreview?.winnerTerms ?? []);
  const campaignStateUpdates = result.campaignStateReviewPreview?.campaignStateUpdates ?? [];
  const campaignBudgetUpdates = result.budgetReviewPreview?.campaignBudgetUpdates ?? [];
  const nextOptimizationRules = result.nextOptimizationRules ?? [];
  const suppressBidReductions = nextOptimizationRules.some((rule: any) => rule.rule === "restore_prior_converting_bids");
  const originalKeywordBidUpdates = result.bidKeywordPreview?.keywordBidUpdates ?? [];
  const originalAdGroupBidUpdates = result.bidKeywordPreview?.adGroupBidUpdates ?? [];
  const suppressedBidReductionCount = suppressBidReductions ? originalKeywordBidUpdates.length + originalAdGroupBidUpdates.length : 0;
  const keywordBidUpdates = suppressBidReductions ? [] : originalKeywordBidUpdates;
  const adGroupBidUpdates = suppressBidReductions ? [] : originalAdGroupBidUpdates;
  const negativeKeywords = result.bidKeywordPreview?.negativeKeywords ?? [];
  return {
    operation: "preview_amazon_ads_sku_apply_plan" as const,
    mode: "review_only" as const,
    profileId,
    status: result.status ?? "UNKNOWN",
    reportId: result.reportId,
    applied: false as const,
    summary: {
      strategy: result.strategyPlan?.strategy ?? "unknown",
      priorities: {
        budgetProtection: result.strategyPlan?.budgetProtection?.priority ?? "normal",
        salesGrowth: result.strategyPlan?.salesGrowth?.priority ?? "normal",
        listingConversion: result.strategyPlan?.listingConversion?.priority ?? "normal"
      },
      actionCounts: {
        campaignStateUpdates: campaignStateUpdates.length,
        campaignBudgetUpdates: campaignBudgetUpdates.length,
        keywordBidUpdates: keywordBidUpdates.length,
        adGroupBidUpdates: adGroupBidUpdates.length,
        negativeKeywords: negativeKeywords.length,
        campaignCreations: campaignCreations.length
      },
      ...(nextOptimizationRules.length ? { nextOptimizationRules } : {}),
      ...(suppressedBidReductionCount > 0 ? { guardrails: [`Suppressed ${suppressedBidReductionCount} bid reduction payload(s) because the last bid-control change correlated with worse orders or sales.`] } : {})
    },
    payloads: {
      campaignCreations: {
        tool: "amazon_ads_create_campaigns" as const,
        mode: "preview" as const,
        profileId,
        campaigns: campaignCreations
      },
      campaignStates: {
        tool: "amazon_ads_update_campaign_states" as const,
        mode: "preview" as const,
        profileId,
        campaigns: campaignStateUpdates
      },
      campaignBudgets: {
        tool: "amazon_ads_update_campaign_budgets" as const,
        mode: "preview" as const,
        profileId,
        campaigns: campaignBudgetUpdates
      },
      keywordBids: {
        tool: "amazon_ads_update_keyword_bids" as const,
        mode: "preview" as const,
        profileId,
        keywords: keywordBidUpdates
      },
      adGroupBids: {
        tool: "amazon_ads_update_ad_group_bids" as const,
        mode: "preview" as const,
        profileId,
        adGroups: adGroupBidUpdates
      },
      negativeKeywords: {
        tool: "amazon_ads_create_negative_keywords" as const,
        mode: "preview" as const,
        profileId,
        negativeKeywords
      }
    },
    warning: "Review-only apply plan. Each payload still requires its own preview call and confirmation token before any Amazon Ads write."
  };
}

export function buildAmazonAdsSkuCampaignCreationCandidates(winnerTerms: Array<Record<string, any>>) {
  return winnerTerms.slice(0, 3).map(term => ({
    name: `ShopWeaver Exact | ${String(term.searchTerm ?? "winner term").trim()}`.slice(0, 128),
    targetingType: "MANUAL" as const,
    state: "PAUSED" as const,
    startDate: new Date().toISOString().slice(0, 10),
    budget: { budgetType: "DAILY" as const, budget: 5 },
    dynamicBidding: {
      strategy: "AUTO_FOR_SALES" as const,
      placementBidding: []
    },
    reason: "Create paused exact campaign candidate from efficient winner term; review keywords, SKU fit, and budget before confirming."
  }));
}

export function renderAmazonAdsSkuOptimizationSummary(result: Record<string, any>): string {
  const strategyPlan = result.strategyPlan ?? {};
  const budgetProtection = strategyPlan.budgetProtection ?? {};
  const salesGrowth = strategyPlan.salesGrowth ?? {};
  const listingConversion = strategyPlan.listingConversion ?? {};
  const budgetUpdates = result.budgetReviewPreview?.campaignBudgetUpdates ?? [];
  const skuReviews = result.controlPreview?.skuSpendReviews ?? [];
  const bidKeywordPreview = result.bidKeywordPreview ?? {};
  return [
    "Amazon Ads SKU Optimization Summary",
    `Status: ${result.status ?? "UNKNOWN"} | Report: ${result.reportId ?? ""} | Rows: ${result.rowCount ?? 0} | SKUs: ${result.skuCampaignCount ?? 0} | Applied: ${result.applied === true}`,
    `Strategy: ${strategyPlan.strategy ?? "unknown"}`,
    `Budget efficiency: ${budgetProtection.priority ?? "normal"} | waste terms: ${budgetProtection.wasteTermCount ?? 0} | budget reviews: ${budgetProtection.budgetReviewCount ?? 0}`,
    ...lines(budgetProtection.recommendedActions),
    `Sales growth: ${salesGrowth.priority ?? "normal"} | efficient terms: ${salesGrowth.efficientTermCount ?? 0}`,
    ...lines(salesGrowth.recommendedActions),
    `Listing conversion: ${listingConversion.priority ?? "normal"} | SKU reviews: ${listingConversion.skuReviewCount ?? 0}`,
    ...lines(listingConversion.recommendedActions),
    "Budget payloads:",
    ...(budgetUpdates.length > 0 ? budgetUpdates.map((update: any) => `- campaign ${update.campaignId} -> ${update.budget?.budgetType} ${update.budget?.budget}: ${update.reason}`) : ["- none"]),
    "Bid and keyword previews:",
    `- negatives: ${bidKeywordPreview.negativeKeywordCount ?? 0} | keyword bid reductions: ${bidKeywordPreview.keywordBidUpdateCount ?? 0} | ad group bid reductions: ${bidKeywordPreview.adGroupBidUpdateCount ?? 0} | winner terms: ${bidKeywordPreview.winnerTermCount ?? 0}`,
    ...negativeKeywordLines(bidKeywordPreview.negativeKeywords),
    ...keywordBidLines(bidKeywordPreview.keywordBidUpdates),
    ...adGroupBidLines(bidKeywordPreview.adGroupBidUpdates),
    ...winnerTermLines(bidKeywordPreview.winnerTerms),
    "SKU reviews:",
    ...(skuReviews.length > 0 ? skuReviews.map((review: any) => `- ${review.sku} | ${review.campaignName} | spend ${review.spend} | ${review.recommendedNextStep}`) : ["- none"]),
    `Cadence: ${strategyPlan.cadence ?? "Run after each completed report."}`
  ].join("\n");
}

function splitCsv(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function outputFormat(value: string | undefined): AmazonAdsSkuOptimizeArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary" || value === "apply-plan" || value === "budget-preview" || value === "keyword-bids-preview" || value === "ad-group-bids-preview" || value === "negative-keywords-preview") return value;
  throw usageError();
}

function lines(values: unknown): string[] {
  return Array.isArray(values) ? values.map(value => `- ${String(value)}`) : [];
}

function negativeKeywordLines(values: unknown): string[] {
  return Array.isArray(values) ? values.map((value: any) => `- negative ${value.campaignId}/${value.adGroupId}: ${value.keywordText}`) : [];
}

function keywordBidLines(values: unknown): string[] {
  return Array.isArray(values) ? values.map((value: any) => `- keyword ${value.keywordId} -> bid ${value.bid}: ${value.reason}`) : [];
}

function adGroupBidLines(values: unknown): string[] {
  return Array.isArray(values) ? values.map((value: any) => `- ad group ${value.adGroupId} -> default bid ${value.defaultBid}: ${value.reason}`) : [];
}

function winnerTermLines(values: unknown): string[] {
  return Array.isArray(values) ? values.map((value: any) => `- winner ${value.campaignName}: ${value.searchTerm} | ACOS ${value.acos} | ${value.recommendation}`) : [];
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_SKU_OPTIMIZE_ARGS_INVALID", "Usage: npm run amazon:ads:sku -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --target-skus SKU1,SKU2 [--target-skus-with-sales SKU1] [--non-target-skus-with-sales SKU3] [--sales-signals /path/order-comparison.json] [--report-id REPORT_ID] [--format json|summary|apply-plan|budget-preview|keyword-bids-preview|ad-group-bids-preview|negative-keywords-preview]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads SKU optimization failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
