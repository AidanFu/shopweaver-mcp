#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { AmazonAdsClient } from "./amazon/ads-client.js";
import { type AmazonAdsSkuOptimizationCycleInput, runAmazonAdsSkuOptimizationCycle } from "./amazon/ads-sku-optimization-cycle.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

export function parseAmazonAdsSkuOptimizeArgs(args: string[]): AmazonAdsSkuOptimizationCycleInput {
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
    ...(values.get("--report-id") ? { reportId: values.get("--report-id") } : {})
  };
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const amazonAds = new AmazonAdsClient(store);
  const result = await runAmazonAdsSkuOptimizationCycle(amazonAds, parseAmazonAdsSkuOptimizeArgs(process.argv.slice(2)));
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function splitCsv(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function usageError() {
  return new ShopWeaverError("AMAZON_ADS_SKU_OPTIMIZE_ARGS_INVALID", "Usage: npm run amazon:ads:sku -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --target-skus SKU1,SKU2 [--target-skus-with-sales SKU1] [--non-target-skus-with-sales SKU3] [--report-id REPORT_ID]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Ads SKU optimization failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
