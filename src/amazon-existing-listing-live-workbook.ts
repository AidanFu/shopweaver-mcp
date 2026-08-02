#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { AmazonSpApiClient } from "./amazon/sp-api-client.js";
import { writeAmazonExistingListingOptimizationWorkbook, type AmazonExistingListingSalesSignal } from "./amazon/listing-optimization-workbook.js";
import type { AmazonExistingListingInput } from "./amazon/listing-optimization.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonExistingListingLiveWorkbookArgs {
  skus: string[];
  outputPath: string;
  marketplaceId: string;
  productType: string;
  outputFormat: "json" | "summary";
  salesSignalsPath?: string;
}

type AmazonListingReadClient = {
  getListingItem(sku: string): Promise<AmazonExistingListingInput>;
};

export function parseAmazonExistingListingLiveWorkbookArgs(args: string[]): AmazonExistingListingLiveWorkbookArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const skus = splitCsv(values.get("--skus") ?? "");
  const parsed = {
    skus,
    outputPath: values.get("--output"),
    marketplaceId: values.get("--marketplace-id"),
    productType: values.get("--product-type"),
    outputFormat: outputFormat(values.get("--format")),
    ...(values.get("--sales-signals") ? { salesSignalsPath: values.get("--sales-signals") } : {})
  };
  if (skus.length === 0 || !parsed.outputPath || !parsed.marketplaceId || !parsed.productType) throw usageError();
  return parsed as AmazonExistingListingLiveWorkbookArgs;
}

export async function buildAmazonExistingListingWorkbookFromClient(client: AmazonListingReadClient, args: AmazonExistingListingLiveWorkbookArgs) {
  const listings = await Promise.all(args.skus.map(sku => client.getListingItem(sku)));
  const salesSignals = args.salesSignalsPath ? await readSalesSignals(args.salesSignalsPath) : undefined;
  const result = await writeAmazonExistingListingOptimizationWorkbook({
    outputPath: args.outputPath,
    marketplaceId: args.marketplaceId,
    productType: args.productType,
    listings,
    ...(salesSignals ? { salesSignals } : {})
  });
  return {
    ...result,
    fetchedSkus: args.skus
  };
}

export function renderAmazonExistingListingLiveWorkbookSummary(result: Record<string, any>): string {
  const skus = Array.isArray(result.fetchedSkus) ? result.fetchedSkus.join(", ") : "";
  return [
    "Amazon Existing Listing Live Optimization Workbook",
    `Fetched SKUs: ${skus}`,
    `Listings: ${result.listingCount ?? 0} | optimized patches: ${result.optimizedPatchCount ?? 0}`,
    `Output: ${result.outputPath ?? ""}`,
    "Amazon write status: none"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonExistingListingLiveWorkbookArgs(process.argv.slice(2));
  const amazon = new AmazonSpApiClient(new KeychainCredentialStore());
  const result = await buildAmazonExistingListingWorkbookFromClient({
    getListingItem: async sku => amazon.getListingItem(sku) as Promise<AmazonExistingListingInput>
  }, args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonExistingListingLiveWorkbookSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function outputFormat(value: string | undefined): AmazonExistingListingLiveWorkbookArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function splitCsv(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

async function readSalesSignals(filePath: string): Promise<AmazonExistingListingSalesSignal[]> {
  const input = JSON.parse(await readFile(filePath, "utf8")) as { salesSignals?: AmazonExistingListingSalesSignal[] } | AmazonExistingListingSalesSignal[];
  return Array.isArray(input) ? input : input.salesSignals ?? [];
}

function usageError() {
  return new ShopWeaverError("AMAZON_EXISTING_LISTING_LIVE_WORKBOOK_ARGS_INVALID", "Usage: npm run amazon:listings:live-workbook -- --skus SKU1,SKU2 --output /path/listing-optimization.xlsx --marketplace-id MARKETPLACE --product-type PRODUCT_TYPE [--sales-signals /path/sales-signals.json] [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon live listing workbook generation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
