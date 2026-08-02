#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { FileAmazonAdsChangeLog } from "./amazon/ads-change-log.js";
import { compareAmazonAdsOptimizationReportFiles } from "./amazon/ads-optimization-history.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonAdsCompareArgs {
  beforeLabel: string;
  beforeStartDate: string;
  beforeEndDate: string;
  beforeFilePath: string;
  afterLabel: string;
  afterStartDate: string;
  afterEndDate: string;
  afterFilePath: string;
  profileId?: string;
  outputFormat: "json" | "summary";
}

export function parseAmazonAdsCompareArgs(args: string[]): AmazonAdsCompareArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const parsed = {
    beforeLabel: values.get("--before-label"),
    beforeStartDate: values.get("--before-start-date"),
    beforeEndDate: values.get("--before-end-date"),
    beforeFilePath: values.get("--before-file"),
    afterLabel: values.get("--after-label"),
    afterStartDate: values.get("--after-start-date"),
    afterEndDate: values.get("--after-end-date"),
    afterFilePath: values.get("--after-file"),
    profileId: values.get("--profile-id"),
    outputFormat: outputFormat(values.get("--format"))
  };
  if (!parsed.beforeLabel || !parsed.beforeStartDate || !parsed.beforeEndDate || !parsed.beforeFilePath || !parsed.afterLabel || !parsed.afterStartDate || !parsed.afterEndDate || !parsed.afterFilePath) throw usageError();
  return parsed as AmazonAdsCompareArgs;
}

async function main(): Promise<void> {
  const input = parseAmazonAdsCompareArgs(process.argv.slice(2));
  const result = await compareAmazonAdsOptimizationReportFiles({
    ...input,
    ...(input.profileId ? { changeLog: new FileAmazonAdsChangeLog() } : {})
  });
  stdout.write(`${input.outputFormat === "summary" ? renderAmazonAdsComparisonSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

export function renderAmazonAdsComparisonSummary(result: Record<string, any>): string {
  const actionSummary = result.appliedActionSummary ?? {};
  const learningPlan = result.appliedActionLearningPlan ?? {};
  const campaignChanges = result.campaignChanges ?? [];
  return [
    "Amazon Ads Optimization Comparison",
    `${result.beforeLabel ?? ""} -> ${result.afterLabel ?? ""} | verdict: ${result.verdict ?? "unknown"}`,
    `Spend: ${result.spendChange ?? 0} | Sales: ${result.salesChange ?? 0} | Orders: ${result.orderChange ?? 0} | Blended ACOS: ${result.blendedAcosChange ?? 0}`,
    `Applied actions: ${actionSummary.actionCount ?? 0} | budgets: ${actionSummary.campaignBudgetUpdateCount ?? 0} | keyword bids: ${actionSummary.keywordBidUpdateCount ?? 0} | ad group bids: ${actionSummary.adGroupBidUpdateCount ?? 0} | negatives: ${actionSummary.negativeKeywordCount ?? 0}`,
    `Learning plan: ${learningPlan.actionMix ?? "collect_more_data"} | priority: ${learningPlan.priority ?? "normal"}`,
    ...lines(learningPlan.recommendations),
    `Cadence: ${learningPlan.cadence ?? "Run after each post-change report."}`,
    "Campaign changes:",
    ...(campaignChanges.length > 0 ? campaignChanges.map((campaign: any) => `- ${campaign.campaignId} | ${campaign.campaignName} | ${campaign.verdict} | spend ${campaign.spendChange} | sales ${campaign.salesChange} | orders ${campaign.orderChange}`) : ["- none"])
  ].join("\n");
}

function outputFormat(value: string | undefined): AmazonAdsCompareArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function lines(values: unknown): string[] {
  return Array.isArray(values) ? values.map(value => `- ${String(value)}`) : [];
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_COMPARE_ARGS_INVALID", "Usage: npm run amazon:ads:compare -- --before-label LABEL --before-start-date YYYY-MM-DD --before-end-date YYYY-MM-DD --before-file /path/before.csv --after-label LABEL --after-start-date YYYY-MM-DD --after-end-date YYYY-MM-DD --after-file /path/after.csv [--profile-id PROFILE] [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads comparison failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
