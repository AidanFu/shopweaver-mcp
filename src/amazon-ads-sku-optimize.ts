#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { AmazonAdsClient } from "./amazon/ads-client.js";
import { type AmazonAdsSkuOptimizationCycleInput, runAmazonAdsSkuOptimizationCycle } from "./amazon/ads-sku-optimization-cycle.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

export interface AmazonAdsSkuOptimizeArgs extends AmazonAdsSkuOptimizationCycleInput {
  outputFormat: "json" | "summary" | "budget-preview";
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
    ...(values.get("--report-id") ? { reportId: values.get("--report-id") } : {})
  };
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const amazonAds = new AmazonAdsClient(store);
  const args = parseAmazonAdsSkuOptimizeArgs(process.argv.slice(2));
  const result = await runAmazonAdsSkuOptimizationCycle(amazonAds, args);
  stdout.write(`${renderAmazonAdsSkuOptimizationResult(args, result)}\n`);
}

function renderAmazonAdsSkuOptimizationResult(args: AmazonAdsSkuOptimizeArgs, result: Record<string, any>): string {
  if (args.outputFormat === "summary") return renderAmazonAdsSkuOptimizationSummary(result);
  if (args.outputFormat === "budget-preview") return JSON.stringify(buildAmazonAdsSkuBudgetPreviewPayload(args.profileId, result), null, 2);
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

export function renderAmazonAdsSkuOptimizationSummary(result: Record<string, any>): string {
  const strategyPlan = result.strategyPlan ?? {};
  const budgetProtection = strategyPlan.budgetProtection ?? {};
  const salesGrowth = strategyPlan.salesGrowth ?? {};
  const listingConversion = strategyPlan.listingConversion ?? {};
  const budgetUpdates = result.budgetReviewPreview?.campaignBudgetUpdates ?? [];
  const skuReviews = result.controlPreview?.skuSpendReviews ?? [];
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
  if (value === "json" || value === "summary" || value === "budget-preview") return value;
  throw usageError();
}

function lines(values: unknown): string[] {
  return Array.isArray(values) ? values.map(value => `- ${String(value)}`) : [];
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_SKU_OPTIMIZE_ARGS_INVALID", "Usage: npm run amazon:ads:sku -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --target-skus SKU1,SKU2 [--target-skus-with-sales SKU1] [--non-target-skus-with-sales SKU3] [--report-id REPORT_ID] [--format json|summary|budget-preview]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads SKU optimization failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
