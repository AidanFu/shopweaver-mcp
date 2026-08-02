#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { writeAmazonExistingListingOptimizationWorkbook, type AmazonExistingListingOptimizationWorkbookInput } from "./amazon/listing-optimization-workbook.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonExistingListingWorkbookArgs {
  inputPath: string;
  outputPath: string;
  marketplaceId: string;
  productType: string;
  outputFormat: "json" | "summary";
}

export function parseAmazonExistingListingWorkbookArgs(args: string[]): AmazonExistingListingWorkbookArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const parsed = {
    inputPath: values.get("--input"),
    outputPath: values.get("--output"),
    marketplaceId: values.get("--marketplace-id"),
    productType: values.get("--product-type"),
    outputFormat: outputFormat(values.get("--format"))
  };
  if (!parsed.inputPath || !parsed.outputPath || !parsed.marketplaceId || !parsed.productType) throw usageError();
  return parsed as AmazonExistingListingWorkbookArgs;
}

export async function buildAmazonExistingListingWorkbookFromFile(args: AmazonExistingListingWorkbookArgs) {
  const input = JSON.parse(await readFile(args.inputPath, "utf8")) as Pick<AmazonExistingListingOptimizationWorkbookInput, "listings">;
  return writeAmazonExistingListingOptimizationWorkbook({
    outputPath: args.outputPath,
    marketplaceId: args.marketplaceId,
    productType: args.productType,
    listings: input.listings
  });
}

export function renderAmazonExistingListingWorkbookSummary(result: Record<string, any>): string {
  return [
    "Amazon Existing Listing Optimization Workbook",
    `Listings: ${result.listingCount ?? 0} | optimized patches: ${result.optimizedPatchCount ?? 0}`,
    `Output: ${result.outputPath ?? ""}`,
    "Amazon write status: none"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonExistingListingWorkbookArgs(process.argv.slice(2));
  const result = await buildAmazonExistingListingWorkbookFromFile(args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonExistingListingWorkbookSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function outputFormat(value: string | undefined): AmazonExistingListingWorkbookArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function usageError() {
  return new ShopWeaverError("AMAZON_EXISTING_LISTING_WORKBOOK_ARGS_INVALID", "Usage: npm run amazon:listings:workbook -- --input /path/listings.json --output /path/listing-optimization.xlsx --marketplace-id MARKETPLACE --product-type PRODUCT_TYPE [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon existing listing workbook generation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
