#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { AmazonAdsClient } from "./amazon/ads-client.js";
import { runAmazonAdsCampaignOptimizationCycle } from "./amazon/ads-optimization-cycle.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonAdsOptimizeArgs {
  profileId: string;
  startDate: string;
  endDate: string;
  outputPath: string;
  reportId?: string;
}

export function parseAmazonAdsOptimizeArgs(args: string[]): AmazonAdsOptimizeArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const parsed = {
    profileId: values.get("--profile-id"),
    startDate: values.get("--start-date"),
    endDate: values.get("--end-date"),
    outputPath: values.get("--output"),
    reportId: values.get("--report-id")
  };
  if (!parsed.profileId || !parsed.startDate || !parsed.endDate || !parsed.outputPath) throw usageError();
  return parsed as AmazonAdsOptimizeArgs;
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const amazonAds = new AmazonAdsClient(store);
  const result = await runAmazonAdsCampaignOptimizationCycle(amazonAds, parseAmazonAdsOptimizeArgs(process.argv.slice(2)));
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_OPTIMIZE_ARGS_INVALID", "Usage: npm run amazon:ads:optimize -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --output /absolute/path.xlsx [--report-id REPORT_ID]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads optimization failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
