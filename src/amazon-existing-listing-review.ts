#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { previewAmazonExistingListingApprovedCopyUpdates, readAmazonExistingListingCopyDecisions } from "./amazon/listing-optimization-workbook.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonExistingListingReviewArgs {
  mode: "decisions" | "preview";
  filePath: string;
  marketplaceId?: string;
  productType?: string;
  outputFormat: "json" | "summary";
}

export function parseAmazonExistingListingReviewArgs(args: string[]): AmazonExistingListingReviewArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const mode = reviewMode(values.get("--mode"));
  const parsed = {
    mode,
    filePath: values.get("--file"),
    ...(values.get("--marketplace-id") ? { marketplaceId: values.get("--marketplace-id") } : {}),
    ...(values.get("--product-type") ? { productType: values.get("--product-type") } : {}),
    outputFormat: outputFormat(values.get("--format"))
  };
  if (!parsed.filePath) throw usageError();
  if (mode === "preview" && (!parsed.marketplaceId || !parsed.productType)) throw usageError();
  return parsed as AmazonExistingListingReviewArgs;
}

export async function buildAmazonExistingListingReviewResult(args: AmazonExistingListingReviewArgs) {
  if (args.mode === "decisions") return readAmazonExistingListingCopyDecisions(args.filePath);
  return previewAmazonExistingListingApprovedCopyUpdates(args.filePath, {
    marketplaceId: args.marketplaceId ?? "",
    productType: args.productType ?? ""
  });
}

export function renderAmazonExistingListingReviewSummary(result: Record<string, any>): string {
  const approvedCount = result.approvedListingCount ?? result.reviewedListingCount ?? 0;
  const skus = Array.isArray(result.patches)
    ? result.patches.map((patch: any) => patch.sku).filter(Boolean)
    : Array.isArray(result.decisions)
      ? result.decisions.map((decision: any) => decision.sku).filter(Boolean)
      : [];
  return [
    "Amazon Existing Listing Review",
    `Operation: ${result.operation ?? "unknown"}`,
    `Approved listings: ${approvedCount} | invalid decisions: ${result.invalidDecisionCount ?? 0}`,
    `SKUs: ${skus.length > 0 ? skus.join(", ") : "none"}`,
    "Amazon write status: none"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonExistingListingReviewArgs(process.argv.slice(2));
  const result = await buildAmazonExistingListingReviewResult(args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonExistingListingReviewSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function reviewMode(value: string | undefined): AmazonExistingListingReviewArgs["mode"] {
  if (value === "decisions" || value === "preview") return value;
  throw usageError();
}

function outputFormat(value: string | undefined): AmazonExistingListingReviewArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function usageError() {
  return new ShopWeaverError("AMAZON_EXISTING_LISTING_REVIEW_ARGS_INVALID", "Usage: npm run amazon:listings:review -- --mode decisions|preview --file /path/reviewed-listings.xlsx [--marketplace-id MARKETPLACE --product-type PRODUCT_TYPE] [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon existing listing review failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
