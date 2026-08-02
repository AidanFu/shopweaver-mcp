#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { FileAmazonAdsChangeLog, type AmazonAdsChangeLog } from "./amazon/ads-change-log.js";
import { buildAmazonAdsAppliedActionLearningPlan, summarizeAmazonAdsAppliedActions } from "./amazon/ads-optimization-history.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonAdsHistoryArgs {
  profileId?: string;
  operation?: string;
  campaignId?: string;
  limit?: number;
  outputFormat: "json" | "summary";
}

export function parseAmazonAdsHistoryArgs(args: string[]): AmazonAdsHistoryArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  return {
    ...(values.get("--profile-id") ? { profileId: values.get("--profile-id") } : {}),
    ...(values.get("--operation") ? { operation: values.get("--operation") } : {}),
    ...(values.get("--campaign-id") ? { campaignId: values.get("--campaign-id") } : {}),
    ...(values.get("--limit") ? { limit: positiveInteger(values.get("--limit")) } : {}),
    outputFormat: outputFormat(values.get("--format"))
  };
}

export async function buildAmazonAdsHistorySummaryResult(changeLog: Pick<AmazonAdsChangeLog, "read">, args: AmazonAdsHistoryArgs) {
  const filters = {
    ...(args.profileId ? { profileId: args.profileId } : {}),
    ...(args.operation ? { operation: args.operation } : {}),
    ...(args.campaignId ? { campaignId: args.campaignId } : {}),
    ...(args.limit ? { limit: args.limit } : {})
  };
  const records = await changeLog.read(filters);
  const summary = summarizeAmazonAdsAppliedActions(records.records);
  return {
    operation: "summarize_amazon_ads_change_log" as const,
    filters,
    sourceRecordCount: records.recordCount,
    summary,
    learningPlan: buildAmazonAdsAppliedActionLearningPlan(summary)
  };
}

export function renderAmazonAdsHistorySummary(result: Record<string, any>): string {
  const filters = result.filters ?? {};
  const summary = result.summary ?? {};
  const learningPlan = result.learningPlan ?? {};
  return [
    "Amazon Ads Change Log Summary",
    `Records: ${result.sourceRecordCount ?? 0} | profile: ${filters.profileId ?? "all"} | operation: ${filters.operation ?? "all"} | campaign: ${filters.campaignId ?? "all"}`,
    `Applied actions: ${summary.actionCount ?? 0} | budgets: ${summary.campaignBudgetUpdateCount ?? 0} | keyword bids: ${summary.keywordBidUpdateCount ?? 0} | ad group bids: ${summary.adGroupBidUpdateCount ?? 0} | negatives: ${summary.negativeKeywordCount ?? 0}`,
    `Learning plan: ${learningPlan.actionMix ?? "collect_more_data"} | priority: ${learningPlan.priority ?? "normal"}`,
    ...lines(learningPlan.recommendations),
    `Cadence: ${learningPlan.cadence ?? "Review after the next report."}`
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonAdsHistoryArgs(process.argv.slice(2));
  const result = await buildAmazonAdsHistorySummaryResult(new FileAmazonAdsChangeLog(), args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonAdsHistorySummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function outputFormat(value: string | undefined): AmazonAdsHistoryArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function positiveInteger(value: string | undefined): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw usageError();
}

function lines(values: unknown): string[] {
  return Array.isArray(values) ? values.map(value => `- ${String(value)}`) : [];
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_HISTORY_ARGS_INVALID", "Usage: npm run amazon:ads:history -- [--profile-id PROFILE] [--operation OPERATION] [--campaign-id CAMPAIGN_ID] [--limit 50] [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads history summary failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
